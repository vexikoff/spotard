import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // If there is no code or state, redirect to home page (prevents redirect loop)
  if (!code && !state) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const targetUrl = new URL('/api/auth/oauth2/callback/yandex', req.url)
  if (code) targetUrl.searchParams.set('code', code)
  if (state) targetUrl.searchParams.set('state', state)
  if (error) targetUrl.searchParams.set('error', error)

  return NextResponse.redirect(targetUrl)
}
