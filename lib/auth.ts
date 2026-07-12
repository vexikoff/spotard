import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import nodemailer from 'nodemailer'
import { genericOAuth } from 'better-auth/plugins'
import { createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'
import crypto from 'crypto'

const telegramAuthPlugin = () => {
  return {
    id: 'telegram-auth',
    endpoints: {
      telegramCallback: createAuthEndpoint(
        '/telegram-callback',
        {
          method: 'GET',
        },
        async (ctx) => {
          const id = ctx.query.id
          const first_name = ctx.query.first_name
          const username = ctx.query.username
          const auth_date = ctx.query.auth_date
          const hash = ctx.query.hash

          if (!id || !hash || !auth_date) {
            return ctx.json({ error: 'Missing parameters' }, { status: 400 })
          }

          const botToken = process.env.TELEGRAM_BOT_TOKEN
          if (!botToken) {
            return ctx.json({ error: 'Telegram authentication token not configured' }, { status: 500 })
          }

          const params: string[] = []
          for (const key in ctx.query) {
            if (key !== 'hash' && ctx.query[key]) {
              params.push(`${key}=${ctx.query[key]}`)
            }
          }
          params.sort()
          const dataCheckString = params.join('\n')

          const secretKey = crypto.createHash('sha256').update(botToken).digest()
          const computedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex')

          if (computedHash !== hash) {
            return ctx.json({ error: 'Invalid hash signature' }, { status: 403 })
          }

          const authTimestamp = parseInt(auth_date) * 1000
          if (Date.now() - authTimestamp > 24 * 60 * 60 * 1000) {
            return ctx.json({ error: 'Auth credentials expired' }, { status: 403 })
          }

          const email = `telegram-${id}@spotard.app`
          const displayName = username || first_name || `tg_${id}`

          const { db } = await import('@/lib/db')
          const { user } = await import('@/lib/db/schema')
          const { eq } = await import('drizzle-orm')

          let dbUser = null
          const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
          if (existing) {
            dbUser = existing
            if (dbUser.banned) {
              return ctx.json({ error: 'User is banned' }, { status: 403 })
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

          const session = await ctx.internalAdapter.createSession(dbUser.id)
          await setSessionCookie(ctx, {
            session,
            user: dbUser,
          })

          throw ctx.redirect('/')
        }
      ),
      telegramWebapp: createAuthEndpoint(
        '/telegram/webapp',
        {
          method: 'POST',
        },
        async (ctx) => {
          const body = ctx.body as any
          const initData = body?.initData

          if (!initData) {
            return ctx.json({ error: 'Missing initData' }, { status: 400 })
          }

          const botToken = process.env.TELEGRAM_BOT_TOKEN
          if (!botToken) {
            return ctx.json({ error: 'Bot token not configured' }, { status: 500 })
          }

          const searchParams = new URLSearchParams(initData)
          const hash = searchParams.get('hash')
          if (!hash) {
            return ctx.json({ error: 'Missing hash' }, { status: 400 })
          }

          const params: string[] = []
          searchParams.forEach((val, key) => {
            if (key !== 'hash') {
              params.push(`${key}=${val}`)
            }
          })
          params.sort()
          const dataCheckString = params.join('\n')

          const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
          const computedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex')

          if (computedHash !== hash) {
            return ctx.json({ error: 'Invalid hash signature' }, { status: 403 })
          }

          const auth_date = searchParams.get('auth_date')
          if (auth_date) {
            const authTimestamp = parseInt(auth_date) * 1000
            if (Date.now() - authTimestamp > 24 * 60 * 60 * 1000) {
              return ctx.json({ error: 'Session expired' }, { status: 403 })
            }
          }

          const userStr = searchParams.get('user')
          if (!userStr) {
            return ctx.json({ error: 'Missing user data' }, { status: 400 })
          }

          const tgUser = JSON.parse(userStr)
          const id = tgUser.id
          const first_name = tgUser.first_name
          const username = tgUser.username

          const email = `telegram-${id}@spotard.app`
          const displayName = username || first_name || `tg_${id}`

          const { db } = await import('@/lib/db')
          const { user: userSchema } = await import('@/lib/db/schema')
          const { eq } = await import('drizzle-orm')

          let dbUser = null
          const [existing] = await db.select().from(userSchema).where(eq(userSchema.email, email)).limit(1)
          if (existing) {
            dbUser = existing
            if (dbUser.banned) {
              return ctx.json({ error: 'User is banned' }, { status: 403 })
            }
          } else {
            const [created] = await db
              .insert(userSchema)
              .values({
                id: `tg-${id}`,
                name: displayName,
                email,
                emailVerified: true,
              })
              .returning()
            dbUser = created
          }

          const session = await ctx.internalAdapter.createSession(dbUser.id)
          await setSessionCookie(ctx, {
            session,
            user: dbUser,
          })

          return ctx.json({ success: true, user: dbUser })
        }
      ),
    },
  } satisfies BetterAuthPlugin
}

export const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'campminecraftmaps@gmail.com',
    pass: 'qhyl fuqr cocu itlg',
  },
})

// Auto-migrate database table user and spots to add new columns on module load
try {
  pool.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT FALSE;').catch((e) => {
    console.error('Auto-migration error for user.banned:', e)
  })
  pool.query('ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "danger_level" INTEGER NOT NULL DEFAULT 1;').catch((e) => {
    console.error('Auto-migration error for spots.danger_level:', e)
  })
  pool.query('ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "danger_description" TEXT NOT NULL DEFAULT \'\';').catch((e) => {
    console.error('Auto-migration error for spots.danger_description:', e)
  })
  pool.query('ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "wear_level" TEXT NOT NULL DEFAULT \'3\';').catch((e) => {
    console.error('Auto-migration error for spots.wear_level:', e)
  })
  pool.query('ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "approved_name" TEXT;').catch((e) => {
    console.error('Auto-migration error for spots.approved_name:', e)
  })
} catch (err) {}

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || 'a-very-secure-default-secret-key-1234567890-xyz',
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: false,
    generateVerificationToken: async () => {
      return Math.floor(100000 + Math.random() * 900000).toString()
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development'
      ? ['http://localhost:3000', `http://localhost:${process.env.PORT ?? 3000}`]
      : []),
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    // v0 preview + Vercel deployment domains (wildcards cover dynamic subdomains)
    'https://*.vusercontent.net',
    'https://*.v0.dev',
    'https://*.v0.app',
    'https://*.vercel.app',
    'https://spotard.claus-maslov.space',
    'http://spotard.claus-maslov.space',
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'yandex'],
    },
  },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the
          // session cookie is stored by the browser.
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: 'yandex',
          clientId: process.env.YANDEX_ID || '',
          clientSecret: process.env.YANDEX_SECRET || '',
          authorizationUrl: 'https://oauth.yandex.ru/authorize',
          tokenUrl: 'https://oauth.yandex.ru/token',
          userInfoUrl: 'https://login.yandex.ru/info?format=json',
          redirectURI: 'https://spotard.claus-maslov.space/yandex',
          getUserInfo: async (tokens) => {
            const res = await fetch('https://login.yandex.ru/info?format=json', {
              headers: {
                Authorization: `OAuth ${tokens.accessToken}`,
              },
            })
            const data = await res.json()
            return {
              id: data.id,
              name: data.real_name || data.display_name || data.login,
              email: data.default_email || data.emails?.[0] || `yandex-${data.id}@spotard.app`,
              image: data.is_avatar_empty ? null : `https://avatars.yandex.net/get-yapic/${data.default_avatar_id}/islands-200`,
            }
          },
        },
      ],
    }),
    telegramAuthPlugin(),
  ],
})
