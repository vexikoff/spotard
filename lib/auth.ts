import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import nodemailer from 'nodemailer'

export const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'campminecraftmaps@gmail.com',
    pass: 'qhyl fuqr cocu itlg',
  },
})

// Auto-migrate database table user to add banned column on module load
try {
  pool.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT FALSE;').catch((e) => {
    console.error('Auto-migration error (can be ignored if column exists):', e)
  })
} catch (err) {}

export const auth = betterAuth({
  database: pool,
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
})
