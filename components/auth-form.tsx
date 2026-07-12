'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { signUpWithVerification, verifyOtpCode } from '@/app/actions/spots'

const inputClass =
  'w-full rounded-lg bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60'

function TelegramWidget() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', 'spotard_bot')
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-auth-url', '/api/auth/telegram')
    script.setAttribute('data-request-access', 'write')
    
    if (ref.current) {
      ref.current.appendChild(script)
    }
    return () => {
      if (ref.current) {
        ref.current.innerHTML = ''
      }
    }
  }, [])

  return <div ref={ref} className="flex justify-center w-full min-h-[40px] items-center my-2" />
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [enteredCode, setEnteredCode] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const res = await verifyOtpCode({ email, code: enteredCode })
    setLoading(false)

    if (!res.success) {
      setError(res.error ?? 'Неверный или истекший код')
      return
    }

    setVerified(true)
    setSuccessMessage('Почта успешно подтверждена! Теперь ты можешь войти в свой аккаунт.')
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      })
    } catch (err: any) {
      setLoading(false)
      setError(err.message || 'Ошибка входа через Google')
    }
  }

  const handleYandexSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      await authClient.signIn.oauth2({
        providerId: 'yandex',
        callbackURL: '/',
      })
    } catch (err: any) {
      setLoading(false)
      setError(err.message || 'Ошибка входа через Яндекс')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (isSignUp) {
      try {
        const exists = await checkUsernameExists(name)
        if (exists) {
          setError('Этот ник уже занят, выбери другой')
          setLoading(false)
          return
        }
      } catch (err) {
        console.error(err)
      }

      try {
        const res = await signUpWithVerification({ email, password, name })
        setLoading(false)
        if (res.success) {
          setSuccessMessage('Аккаунт создан! Код подтверждения отправлен на твой email. Подтверди почту перед входом.')
        } else {
          setError(res.error || 'Что-то пошло не так')
        }
      } catch (_) {
        setLoading(false)
        setError('Что-то пошло не так. Попробуй ещё раз.')
      }
    } else {
      const { error } = await authClient.signIn.email({ email, password })
      setLoading(false)

      if (error) {
        setError(error.message ?? 'Что-то пошло не так')
        return
      }

      router.push('/')
      router.refresh()
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-7 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image
            src="/images/spotard.png"
            alt="Логотип spotard"
            width={48}
            height={48}
            className="size-12 rounded-xl grayscale"
            priority
          />
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-xl leading-tight font-semibold tracking-tight lowercase">spotard</span>
            <h1 className="text-sm leading-tight font-bold text-muted-foreground">
              {isSignUp ? 'Создать аккаунт' : 'С возвращением'}
            </h1>
            <p className="font-mono text-xs leading-tight text-muted-foreground">
              {isSignUp ? 'Зарегистрируйся, чтобы добавлять споты' : 'Войди, чтобы продолжить'}
            </p>
          </div>
        </div>

        {successMessage ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-500">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-mono text-white/90 leading-relaxed">{successMessage}</p>

            {!verified ? (
              <form onSubmit={handleVerifyCode} className="mt-2 flex w-full flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-left">
                  <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Код из письма</span>
                  <input
                    className={inputClass}
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value)}
                    required
                    placeholder="Например: 123456"
                    maxLength={6}
                    autoFocus
                  />
                </label>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Подтверждаем...' : 'Подтвердить код'}
                </Button>
              </form>
            ) : (
              <Link
                href="/sign-in"
                onClick={() => {
                  setSuccessMessage(null)
                  setVerified(false)
                  setEnteredCode('')
                  setError(null)
                }}
                className="mt-2 text-xs font-mono uppercase tracking-widest text-primary underline-offset-4 hover:underline"
              >
                Войти в аккаунт
              </Link>
            )}
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {isSignUp && (
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Ник</span>
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Твой ник на карте"
                    maxLength={40}
                  />
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Email</span>
                <input
                  className={inputClass}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Пароль</span>
                <input
                  className={inputClass}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder="Минимум 8 символов"
                />
              </label>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Подожди...' : isSignUp ? 'Создать аккаунт' : 'Войти'}
              </Button>
            </form>

            <div className="relative my-4 flex items-center justify-center">
              <span className="h-[1px] w-full bg-border/40" />
              <span className="absolute bg-card px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Или</span>
            </div>

            <div className="flex flex-row justify-center gap-3 w-full">
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-12 h-12 rounded-xl bg-[#16171c] hover:bg-[#1e2027] transition-colors duration-200 flex items-center justify-center border-none outline-none cursor-pointer"
                title="Войти через Google"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleYandexSignIn}
                className="w-12 h-12 rounded-xl bg-[#16171c] hover:bg-[#1e2027] transition-colors duration-200 flex items-center justify-center border-none outline-none cursor-pointer"
                title="Войти через Яндекс"
              >
                <svg width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10z" fill="#FC3F1D" />
                  <path d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z" fill="#fff" />
                </svg>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  window.location.href = 'https://oauth.telegram.org/auth?bot_id=7434526922&origin=https://spotard.claus-maslov.space&embed=1&request_access=write&return_to=https://spotard.claus-maslov.space/api/auth/telegram'
                }}
                className="w-12 h-12 rounded-xl bg-[#16171c] hover:bg-[#1e2027] transition-colors duration-200 flex items-center justify-center border-none outline-none cursor-pointer"
                title="Войти через Telegram"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="12" fill="#229ED9" />
                  <path d="M17.5 8.2c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.28-.01.06-.01.24-.02.3z" fill="white" />
                </svg>
              </button>
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isSignUp ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
              <Link
                href={isSignUp ? '/sign-in' : '/sign-up'}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {isSignUp ? 'Войти' : 'Зарегистрироваться'}
              </Link>
            </p>
          </>
        )}

        <p className="mt-3 text-center">
          <Link href="/" className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline">
            ← Назад к карте
          </Link>
        </p>
      </div>
    </main>
  )
}
