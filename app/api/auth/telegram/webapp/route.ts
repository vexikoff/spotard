import { db } from '@/lib/db'
import { user, session } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json()
    if (!initData) {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
    }

    // Parse initData query string
    const searchParams = new URLSearchParams(initData)
    const hash = searchParams.get('hash')
    if (!hash) {
      return NextResponse.json({ error: 'Missing hash' }, { status: 400 })
    }

    // Sort parameters
    const params: string[] = []
    searchParams.forEach((val, key) => {
      if (key !== 'hash') {
        params.push(`${key}=${val}`)
      }
    })
    params.sort()
    const dataCheckString = params.join('\n')

    // WebApp HMAC secret key computation
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    if (computedHash !== hash) {
      return NextResponse.json({ error: 'Invalid hash signature' }, { status: 403 })
    }

    // Validate auth_date freshness (e.g. within 24 hours)
    const auth_date = searchParams.get('auth_date')
    if (auth_date) {
      const authTimestamp = parseInt(auth_date) * 1000
      if (Date.now() - authTimestamp > 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'Session expired' }, { status: 403 })
      }
    }

    // Extract user info
    const userStr = searchParams.get('user')
    if (!userStr) {
      return NextResponse.json({ error: 'Missing user data' }, { status: 400 })
    }

    const tgUser = JSON.parse(userStr)
    const id = tgUser.id
    const first_name = tgUser.first_name
    const username = tgUser.username

    const email = `telegram-${id}@spotard.app`
    const displayName = username || first_name || `tg_${id}`

    let dbUser = null
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

    // Create session
    const sessionId = crypto.randomUUID()
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await db.insert(session).values({
      id: sessionId,
      token,
      userId: dbUser.id,
      expiresAt,
      ipAddress: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    })

    const cookieStore = await cookies()
    const isProd = process.env.NODE_ENV === 'production'
    cookieStore.set('better-auth.session_token', token, {
      httpOnly: true,
      secure: isProd,
      expires: expiresAt,
      path: '/',
    })
    if (isProd) {
      cookieStore.set('__Secure-better-auth.session_token', token, {
        httpOnly: true,
        secure: true,
        expires: expiresAt,
        path: '/',
      })
    }

    return NextResponse.json({ success: true, user: dbUser })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
