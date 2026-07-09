import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'campminecraftmaps@gmail.com',
    pass: 'qhyl fuqr cocu itlg',
  },
})

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
    sendOnSignUp: true,
    generateVerificationToken: async () => {
      return Math.floor(100000 + Math.random() * 900000).toString()
    },
    send: async ({ user, url, token }) => {
      const mailOptions = {
        from: '"spotard" <campminecraftmaps@gmail.com>',
        to: user.email,
        subject: 'Код подтверждения на spotard',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #16171d; color: #ffffff; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #c8f542; font-size: 24px; margin-bottom: 8px; font-weight: bold; text-transform: lowercase; font-family: monospace;">spotard</h1>
              <p style="color: #a0a0a0; font-size: 14px; margin: 0;">карта спотов для трюков</p>
            </div>
            <div style="background-color: #22232a; padding: 24px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
              <p style="margin-top: 0; font-size: 16px; line-height: 1.5; text-align: left;">Привет, <strong>${user.name}</strong>!</p>
              <p style="font-size: 14px; line-height: 1.5; color: #e0e0e0; text-align: left;">Введи этот код на сайте, чтобы подтвердить свой email и активировать аккаунт:</p>
              <div style="background-color: #16171d; color: #c8f542; font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 6px; padding: 16px; border-radius: 8px; display: inline-block; margin: 16px 0;">
                ${token}
              </div>
              <p style="font-size: 12px; color: #a0a0a0; margin-bottom: 0; text-align: left;">Код действителен в течение 1 часа.</p>
            </div>
            <p style="text-align: center; font-size: 11px; color: #606060; margin: 0;">Это письмо отправлено автоматически. Пожалуйста, не отвечайте на него.</p>
          </div>
        `,
      }
      await transporter.sendMail(mailOptions)
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
