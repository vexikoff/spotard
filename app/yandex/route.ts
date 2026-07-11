import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const targetUrl = new URL('/api/auth/callback/yandex', req.url)
  if (code) targetUrl.searchParams.set('code', code)
  if (state) targetUrl.searchParams.set('state', state)
  if (error) targetUrl.searchParams.set('error', error)

  return NextResponse.redirect(targetUrl)
}
