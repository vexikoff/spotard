import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { auth } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const first_name = url.searchParams.get('first_name')
  const username = url.searchParams.get('username')
  const auth_date = url.searchParams.get('auth_date')
  const hash = url.searchParams.get('hash')

  if (!id || !hash || !auth_date) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  // Verify hash using bot token
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ error: 'Telegram authentication is not configured on the server (missing token)' }, { status: 500 })
  }

  // Sort and build check string
  const params: string[] = []
  url.searchParams.forEach((val, key) => {
    if (key !== 'hash') {
      params.push(`${key}=${val}`)
    }
  })
  params.sort()
  const dataCheckString = params.join('\n')

  const secretKey = crypto.createHash('sha256').update(botToken).digest()
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (computedHash !== hash) {
    return NextResponse.json({ error: 'Invalid hash signature' }, { status: 403 })
  }

  // Check freshness (24 hours)
  const authTimestamp = parseInt(auth_date) * 1000
  if (Date.now() - authTimestamp > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Auth credentials expired' }, { status: 403 })
  }

  const email = `telegram-${id}@spotard.app`
  const displayName = username || first_name || `tg_${id}`

  let dbUser = null
  try {
    const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
    if (existing) {
      dbUser = existing
      if (dbUser.banned) {
        return NextResponse.json({ error: 'User is banned' }, { status: 403 })
      }
    } else {
      const [created] = await db
        .insert(user)
        .values({
          id: `tg-${id}`,
          name: displayName,
          email,
          emailVerified: true,
        })
        .returning()
      dbUser = created
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Database error: ' + err.message }, { status: 500 })
  }

  // Create session
  try {
    const session = await auth.createSession({
      userId: dbUser.id,
    })

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set('better-auth.session-token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      expires: new Date(session.expiresAt),
      path: '/',
    })

    // Redirect to home
    return NextResponse.redirect(new URL('/', req.url))
  } catch (err: any) {
    return NextResponse.json({ error: 'Session creation failed: ' + err.message }, { status: 500 })
  }
}
