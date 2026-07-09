'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { comments, messages, reports, spots, user, type Comment, type Message, type Report, type Spot } from '@/lib/db/schema'
import { getUserRole } from '@/lib/spot-config'
import { and, desc, eq, sql } from 'drizzle-orm'
import { triggerPusher } from '@/lib/pusher'

export type SpotInput = {
  name: string
  lat: number
  lng: number
  spotType: string
  difficulty: number
  surface: string
  security: string
  lighting: boolean
  covered: boolean
  description: string
  tags: string
  images?: string
}

const SPOT_TYPES = [
  'street',
  'park',
  'rail',
  'stairs',
  'ledge',
  'gap',
  'bowl',
  'manual',
  'flat',
  'diy',
  'hubba',
  'plaza',
  'polejam',
  'pumptrack',
  'dirt',
  'trials',
  'wallride',
  'bmxtrack',
  'drop',
  'downhill',
  'foampit',
  'bank',
  'curb',
  'quarterpipe',
  'halfpipe',
  'funbox',
  'spine',
  'snakerun',
  'indoor',
]

function isAdmin(user: { email: string; name?: string | null }) {
  return getUserRole(user.email, user.name) === 'admin'
}

function isStaff(user: { email: string; name?: string | null }) {
  const role = getUserRole(user.email, user.name)
  return role === 'admin' || role === 'moderator'
}
const SURFACES = ['concrete', 'asphalt', 'wood', 'metal', 'marble', 'brick', 'dirt']
const SECURITY = ['chill', 'medium', 'strict']

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Войди в аккаунт, чтобы делать это')

  const [dbUser] = await db.select().from(user).where(eq(user.id, session.user.id))
  if (dbUser && dbUser.banned) {
    throw new Error('Твой аккаунт забанен')
  }

  return session.user
}

function validate(input: SpotInput): SpotInput {
  const name = input.name.trim().slice(0, 80)
  if (!name) throw new Error('Name is required')
  if (typeof input.lat !== 'number' || typeof input.lng !== 'number' || Number.isNaN(input.lat) || Number.isNaN(input.lng)) {
    throw new Error('Invalid coordinates')
  }
  return {
    name,
    lat: input.lat,
    lng: input.lng,
    spotType: input.spotType
      ? input.spotType
          .split(',')
          .map((t) => t.trim())
          .filter((t) => SPOT_TYPES.includes(t))
          .join(',') || 'street'
      : 'street',
    difficulty: Math.min(5, Math.max(1, Math.round(input.difficulty) || 3)),
    surface: input.surface
      ? input.surface
          .split(',')
          .map((s) => s.trim())
          .filter((s) => SURFACES.includes(s))
          .join(',') || 'concrete'
      : 'concrete',
    security: SECURITY.includes(input.security) ? input.security : 'chill',
    lighting: Boolean(input.lighting),
    covered: Boolean(input.covered),
    description: input.description.trim().slice(0, 1000),
    tags: input.tags.trim().slice(0, 200),
    images: input.images ? input.images : '[]',
  }
}

// Everyone can view all spots (it's a shared community map)
export async function getSpots(): Promise<Spot[]> {
  return db.select().from(spots).orderBy(desc(spots.createdAt))
}

export async function createSpot(input: SpotInput): Promise<Spot> {
  const sessionUser = await getSessionUser()
  const data = validate(input)
  const [created] = await db
    .insert(spots)
    .values({ ...data, userId: sessionUser.id, authorName: sessionUser.name })
    .returning()
  await triggerPusher('spots', 'created', created)
  return created
}

export async function updateSpot(id: number, input: SpotInput): Promise<Spot> {
  const sessionUser = await getSessionUser()
  const data = validate(input)
  const [existing] = await db.select().from(spots).where(eq(spots.id, id))
  if (!existing) throw new Error('Спот не найден')
  // Only the owner or the admin can edit a spot. Legacy spots (no owner) get claimed by the editor.
  if (existing.userId && existing.userId !== sessionUser.id && !isAdmin(sessionUser)) {
    throw new Error('Это чужой спот — редактировать может только автор')
  }
  const [updated] = await db
    .update(spots)
    .set({ ...data, userId: existing.userId ?? sessionUser.id, authorName: existing.userId ? existing.authorName : sessionUser.name })
    .where(eq(spots.id, id))
    .returning()
  await triggerPusher('spots', 'updated', updated)
  return updated
}

export async function deleteSpot(id: number): Promise<void> {
  const sessionUser = await getSessionUser()
  const [existing] = await db.select().from(spots).where(eq(spots.id, id))
  if (!existing) return
  if (existing.userId && existing.userId !== sessionUser.id && !isAdmin(sessionUser)) {
    throw new Error('Это чужой спот — удалить может только автор')
  }
  await db.delete(spots).where(eq(spots.id, id))
  await db.delete(reports).where(eq(reports.spotId, id))
  await triggerPusher('spots', 'deleted', { id })
}

// --- Reports (жалобы) -------------------------------------------------------

export async function reportSpot(spotId: number, reason: string): Promise<void> {
  const sessionUser = await getSessionUser()
  const [existing] = await db.select().from(spots).where(eq(spots.id, spotId))
  if (!existing) throw new Error('Спот не найден')
  const cleanReason = reason.trim().slice(0, 500)
  if (!cleanReason) throw new Error('Опиши причину жалобы')
  // One open report per user per spot
  const [dup] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.spotId, spotId), eq(reports.reporterId, sessionUser.id), eq(reports.status, 'open')))
  if (dup) throw new Error('Ты уже отправил жалобу на этот спот')
  await db.insert(reports).values({
    spotId,
    reason: cleanReason,
    reporterId: sessionUser.id,
    reporterName: sessionUser.name,
  })
}

export type ReportWithSpot = Report & { spotName: string | null }

// Staff only: list open reports with spot names
export async function getOpenReports(): Promise<ReportWithSpot[]> {
  const sessionUser = await getSessionUser()
  if (!isStaff(sessionUser)) throw new Error('Нет доступа')
  const rows = await db
    .select({
      report: reports,
      spotName: spots.name,
    })
    .from(reports)
    .leftJoin(spots, eq(reports.spotId, spots.id))
    .where(eq(reports.status, 'open'))
    .orderBy(desc(reports.createdAt))
  return rows.map((r) => ({ ...r.report, spotName: r.spotName }))
}

// Staff: dismiss a report (spot stays)
export async function dismissReport(reportId: number): Promise<void> {
  const sessionUser = await getSessionUser()
  if (!isStaff(sessionUser)) throw new Error('Нет доступа')
  await db.update(reports).set({ status: 'dismissed' }).where(eq(reports.id, reportId))
}

// Staff: approve a report and delete the reported spot.
// Admin can delete anything anywhere; moderator can delete ONLY via an open report.
export async function approveReportAndDeleteSpot(reportId: number): Promise<void> {
  const sessionUser = await getSessionUser()
  if (!isStaff(sessionUser)) throw new Error('Нет доступа')
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId))
  if (!report) throw new Error('Жалоба не найдена')
  if (report.status !== 'open') throw new Error('Жалоба уже рассмотрена')
  await db.delete(spots).where(eq(spots.id, report.spotId))
  await db.update(reports).set({ status: 'approved' }).where(eq(reports.id, reportId))
  // Close remaining open reports on the same spot
  await db
    .update(reports)
    .set({ status: 'dismissed' })
    .where(and(eq(reports.spotId, report.spotId), eq(reports.status, 'open')))
}

export async function toggleLikeSpot(spotId: number): Promise<Spot> {
  const sessionUser = await getSessionUser()
  const [existing] = await db.select().from(spots).where(eq(spots.id, spotId))
  if (!existing) throw new Error('Спот не найден')

  let likesList: string[] = []
  try {
    likesList = JSON.parse(existing.likes || '[]')
    if (!Array.isArray(likesList)) likesList = []
  } catch (e) {
    likesList = []
  }

  if (likesList.includes(sessionUser.id)) {
    likesList = likesList.filter((id) => id !== sessionUser.id)
  } else {
    likesList.push(sessionUser.id)
  }

  const [updated] = await db
    .update(spots)
    .set({ likes: JSON.stringify(likesList) })
    .where(eq(spots.id, spotId))
    .returning()

  await triggerPusher('spots', 'updated', updated)
  return updated
}

// --- Comments (комментарии к спотам) ----------------------------------------

export async function getComments(spotId: number): Promise<Comment[]> {
  return db.select().from(comments).where(eq(comments.spotId, spotId)).orderBy(desc(comments.createdAt))
}

export async function addComment(spotId: number, text: string): Promise<Comment> {
  const sessionUser = await getSessionUser()
  const clean = text.trim().slice(0, 500)
  if (!clean) throw new Error('Пустой комментарий')
  const [created] = await db
    .insert(comments)
    .values({ spotId, text: clean, userId: sessionUser.id, authorName: sessionUser.name })
    .returning()
  return created
}

export async function deleteComment(id: number): Promise<void> {
  const sessionUser = await getSessionUser()
  const [existing] = await db.select().from(comments).where(eq(comments.id, id))
  if (!existing) return
  if (existing.userId !== sessionUser.id && !isStaff(sessionUser)) {
    throw new Error('Удалить может только автор')
  }
  await db.delete(comments).where(eq(comments.id, id))
}

// --- Global chat -------------------------------------------------------------

export async function getMessages(): Promise<Message[]> {
  const rows = await db.select().from(messages).orderBy(desc(messages.createdAt)).limit(60)
  return rows.reverse()
}

export async function sendMessage(text: string): Promise<void> {
  const sessionUser = await getSessionUser()
  const clean = text.trim().slice(0, 400)
  if (!clean) throw new Error('Пустое сообщение')
  const [created] = await db
    .insert(messages)
    .values({ text: clean, userId: sessionUser.id, authorName: sessionUser.name })
    .returning()
  await triggerPusher('spots', 'message_created', created)
}

export async function deleteMessage(id: number): Promise<void> {
  const sessionUser = await getSessionUser()
  if (!isStaff(sessionUser)) throw new Error('Нет доступа')
  await db.delete(messages).where(eq(messages.id, id))
  await triggerPusher('spots', 'message_deleted', { id })
}

export async function getIpLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const reqHeaders = await headers()
    const latStr = reqHeaders.get('x-vercel-ip-latitude')
    const lngStr = reqHeaders.get('x-vercel-ip-longitude')
    
    if (latStr && lngStr) {
      const lat = parseFloat(latStr)
      const lng = parseFloat(lngStr)
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng }
      }
    }

    const forwardedFor = reqHeaders.get('x-forwarded-for')
    const realIp = reqHeaders.get('x-real-ip')
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || '')

    // If we have an IP, lookup on the server side to bypass browser client-side blocking
    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
      const res = await fetch(`https://ipapi.co/${ip}/json/`, { next: { revalidate: 3600 } })
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          return { lat: data.latitude, lng: data.longitude }
        }
      }
    } else {
      // If running locally, check raw ipapi.co
      const res = await fetch('https://ipapi.co/json/', { next: { revalidate: 3600 } })
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          return { lat: data.latitude, lng: data.longitude }
        }
      }
    }
  } catch (err) {
    console.error('Server-side IP location lookup failed:', err)
  }

  // Fallback to freeipapi.com
  try {
    const reqHeaders = await headers()
    const forwardedFor = reqHeaders.get('x-forwarded-for')
    const realIp = reqHeaders.get('x-real-ip')
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || '')

    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
      const res = await fetch(`https://freeipapi.com/api/json/${ip}`, { next: { revalidate: 3600 } })
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          return { lat: data.latitude, lng: data.longitude }
        }
      }
    } else {
      const res = await fetch('https://freeipapi.com/api/json', { next: { revalidate: 3600 } })
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          return { lat: data.latitude, lng: data.longitude }
        }
      }
    }
  } catch (err) {
    console.error('Server-side freeipapi.com lookup failed:', err)
  }

  return null
}

const globalRef = global as unknown as {
  onlineTracker?: Map<string, number>
}
if (!globalRef.onlineTracker) {
  globalRef.onlineTracker = new Map()
}

export async function pingOnline(clientId: string): Promise<{
  online: number
  spots: number
  users: number
}> {
  try {
    await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT FALSE;`)
  } catch (err) {
    // Ignore migration error if already migrated
  }

  const now = Date.now()
  const tracker = globalRef.onlineTracker!
  tracker.set(clientId, now)

  // Prune pings older than 45 seconds
  for (const [id, time] of tracker.entries()) {
    if (now - time > 45000) {
      tracker.delete(id)
    }
  }

  // Count spots and users
  const [spotsRes] = await db.select({ count: sql<number>`count(*)` }).from(spots)
  const [usersRes] = await db.select({ count: sql<number>`count(*)` }).from(user)

  return {
    online: tracker.size,
    spots: Number(spotsRes?.count ?? 0),
    users: Number(usersRes?.count ?? 0),
  }
}

export async function checkUsernameExists(name: string): Promise<boolean> {
  const clean = name.trim().toLowerCase()
  if (!clean) return false
  const [existing] = await db
    .select()
    .from(user)
    .where(eq(sql`lower(${user.name})`, clean))
    .limit(1)
  return Boolean(existing)
}

export async function getUsersList() {
  const sessionUser = await getSessionUser()
  if (getUserRole(sessionUser.email, sessionUser.name) !== 'admin') {
    throw new Error('Нет доступа')
  }
  return db.select().from(user).orderBy(desc(user.createdAt))
}

export async function toggleBanUser(userId: string) {
  const sessionUser = await getSessionUser()
  if (getUserRole(sessionUser.email, sessionUser.name) !== 'admin') {
    throw new Error('Нет доступа')
  }
  const [existing] = await db.select().from(user).where(eq(user.id, userId))
  if (!existing) throw new Error('Пользователь не найден')
  
  if (existing.id === sessionUser.id) {
    throw new Error('Нельзя забанить самого себя')
  }

  const nextBanned = !existing.banned
  await db.update(user).set({ banned: nextBanned }).where(eq(user.id, userId))
}

