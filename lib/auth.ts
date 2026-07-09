import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || 'jyulinfl2024@gmail.com',
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
    send: async ({ user, url, token }) => {
      const mailOptions = {
        from: `"spotard" <${process.env.SMTP_USER || 'jyulinfl2024@gmail.com'}>`,
        to: user.email,
        subject: 'Подтверждение почты на spotard',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #16171d; color: #ffffff; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #c8f542; font-size: 24px; margin-bottom: 8px; font-weight: bold; text-transform: lowercase; font-family: monospace;">spotard</h1>
              <p style="color: #a0a0a0; font-size: 14px; margin: 0;">карта спотов для трюков</p>
            </div>
            <div style="background-color: #22232a; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
              <p style="margin-top: 0; font-size: 16px; line-height: 1.5;">Привет, <strong>${user.name}</strong>!</p>
              <p style="font-size: 14px; line-height: 1.5; color: #e0e0e0;">Подтверди свой email, чтобы активировать аккаунт и делиться спотами на карте.</p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${url}" style="background-color: #c8f542; color: #16171d; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 8px; display: inline-block;">Подтвердить почту</a>
              </div>
              <p style="font-size: 12px; color: #a0a0a0; margin-bottom: 0;">Если кнопка выше не работает, перейди по этой ссылке:<br/><a href="${url}" style="color: #c8f542; text-decoration: underline;">${url}</a></p>
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
