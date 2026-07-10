import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { NextResponse, type NextRequest } from 'next/server'

const handler = toNextJsHandler(auth)

export const GET = handler.GET

// Lockouts in memory
type LoginAttempt = {
  count: number
  lockedUntil: number
}

const globalRef = global as any
if (!globalRef.loginAttempts) {
  globalRef.loginAttempts = new Map<string, LoginAttempt>()
}
const loginAttempts = globalRef.loginAttempts as Map<string, LoginAttempt>

function getLockoutDuration(count: number): number {
  if (count < 5) return 0
  if (count === 5) return 60 * 1000
  if (count === 6) return 5 * 60 * 1000
  if (count === 7) return 30 * 60 * 1000
  if (count === 8) return 60 * 60 * 1000
  if (count === 9) return 3 * 60 * 60 * 1000
  if (count === 10) return 6 * 60 * 60 * 1000
  if (count === 11) return 12 * 60 * 60 * 1000
  return 24 * 60 * 60 * 1000
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const isSignIn = url.pathname.endsWith('/api/auth/sign-in/email')

  let identifier = ''
  if (isSignIn) {
    try {
      const body = await req.clone().json()
      identifier = (body.email || '').trim().toLowerCase()
    } catch (_) {}
  }

  if (isSignIn && identifier) {
    const attempt = loginAttempts.get(identifier)
    if (attempt && Date.now() < attempt.lockedUntil) {
      const waitSec = Math.ceil((attempt.lockedUntil - Date.now()) / 1000)
      let waitText = `${waitSec} сек`
      if (waitSec >= 3600) {
        waitText = `${Math.ceil(waitSec / 3600)} ч`
      } else if (waitSec >= 60) {
        waitText = `${Math.ceil(waitSec / 60)} мин`
      }
      return NextResponse.json(
        { message: `Слишком много неудачных попыток входа. Подождите ${waitText}.` },
        { status: 429 }
      )
    }
  }

  // Execute standard Better Auth handler
  const res = await handler.POST(req)

  if (isSignIn && identifier) {
    if (res.status === 200) {
      loginAttempts.delete(identifier)
    } else {
      const attempt = loginAttempts.get(identifier) || { count: 0, lockedUntil: 0 }
      attempt.count += 1
      const duration = getLockoutDuration(attempt.count)
      if (duration > 0) {
        attempt.lockedUntil = Date.now() + duration
      }
      loginAttempts.set(identifier, attempt)

      if (duration > 0) {
        const waitSec = Math.ceil(duration / 1000)
        let waitText = `${waitSec} сек`
        if (waitSec >= 3600) {
          waitText = `${Math.ceil(waitSec / 3600)} ч`
        } else if (waitSec >= 60) {
          waitText = `${Math.ceil(waitSec / 60)} мин`
        }
        return NextResponse.json(
          { message: `Неверный пароль. Вход заблокирован на ${waitText} из-за 5+ ошибок.` },
          { status: 429 }
        )
      }
    }
  }

  return res
}
