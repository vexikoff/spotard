import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const first_name = url.searchParams.get('first_name')
  const username = url.searchParams.get('username')
  const auth_date = url.searchParams.get('auth_date')
  const hash = url.searchParams.get('hash')

  // If parameters are present in the query, redirect to the custom plugin callback endpoint
  if (id && hash && auth_date) {
    const redirectUrl = new URL('/api/auth/telegram-callback', req.url)
    url.searchParams.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value)
    })
    return NextResponse.redirect(redirectUrl)
  }

  // Otherwise, render the client-side parsing HTML page for the hash fragment
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Авторизация Telegram...</title></head>
<body>
  <div style="font-family: sans-serif; text-align: center; margin-top: 50px; color: #888;">
    Авторизация через Telegram...
  </div>
  <script>
    try {
      const hash = window.location.hash;
      if (hash && hash.includes('tgAuthResult=')) {
        const base64 = hash.split('tgAuthResult=')[1].split('&')[0];
        const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = atob(normalized);
        const data = JSON.parse(decoded);
        
        const params = new URLSearchParams();
        for (const key in data) {
          if (data[key] !== undefined && data[key] !== null) {
            params.set(key, String(data[key]));
          }
        }
        window.location.href = '/api/auth/telegram-callback?' + params.toString();
      } else {
        document.body.innerHTML = '<div style="font-family: sans-serif; text-align: center; margin-top: 50px; color: #ff3b30;">Ошибка: Отсутствуют параметры авторизации</div>';
      }
    } catch (e) {
      console.error(e);
      document.body.innerHTML = '<div style="font-family: sans-serif; text-align: center; margin-top: 50px; color: #ff3b30;">Ошибка обработки данных Telegram</div>';
    }
  </script>
</body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    }
  )
}
