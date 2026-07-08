'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

const inputClass =
  'w-full rounded-lg bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password })

    setLoading(false)

    if (error) {
      setError(error.message ?? 'Что-то пошло не так')
      return
    }

    router.push('/')
    router.refresh()
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

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <Link
            href={isSignUp ? '/sign-in' : '/sign-up'}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {isSignUp ? 'Войти' : 'Зарегистрироваться'}
          </Link>
        </p>

        <p className="mt-3 text-center">
          <Link href="/" className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline">
            ← Назад к карте
          </Link>
        </p>
      </div>
    </main>
  )
}
