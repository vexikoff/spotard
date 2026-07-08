import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Manrope, Unbounded } from 'next/font/google'
import './globals.css'

const _manrope = Manrope({ subsets: ['latin', 'cyrillic'] })
const _unbounded = Unbounded({ subsets: ['latin', 'cyrillic'], weight: ['400', '600', '800'] })
const _jetbrainsMono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  title: 'spotard — карта спотов для трюков',
  description:
    'Интерактивная карта спотов: находи и добавляй места для трюков на скейте, велике и BMX в своём городе.',
  generator: 'v0.app',
  icons: {
    icon: '/images/spotard.png',
    apple: '/images/spotard.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#16171d',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className="bg-background">
      <body className="antialiased font-sans">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
