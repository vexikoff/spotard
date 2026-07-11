import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import nodemailer from 'nodemailer'
import { genericOAuth } from 'better-auth/plugins'

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
  ],
})
