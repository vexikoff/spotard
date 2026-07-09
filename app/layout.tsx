import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Manrope, Unbounded } from 'next/font/google'
import './globals.css'

const _manrope = Manrope({ subsets: ['latin', 'cyrillic'] })
const _unbounded = Unbounded({ subsets: ['latin', 'cyrillic'], weight: ['400', '600', '800'] })
const _jetbrainsMono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://v0-spotard.vercel.app'),
  title: 'spotard — интерактивная карта спотов для трюков',
  description:
    'Интерактивная карта спотов: находи и добавляй места для трюков на скейте, самокате, роликах и BMX в своём городе.',
  keywords: [
    'споты для трюков', 'карта спотов', 'скейт споты', 'bmx споты', 'самокат споты',
    'street spots', 'skatepark', 'места для трюков', 'spotard'
  ],
  generator: 'v0.app',
  icons: {
    icon: '/images/spotard.png',
    apple: '/images/spotard.png',
  },
  openGraph: {
    title: 'spotard — интерактивная карта спотов для трюков',
    description: 'Находи и добавляй места для трюков на скейте, самокате и BMX в своём городе.',
    url: 'https://v0-spotard.vercel.app',
    siteName: 'spotard',
    locale: 'ru_RU',
    type: 'website',
    images: [
      {
        url: '/images/spotard.png',
        width: 512,
        height: 512,
        alt: 'spotard logo',
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'spotard — интерактивная карта спотов для трюков',
    description: 'Находи и добавляй места для трюков на скейте, самокате и BMX в своём городе.',
    images: ['/images/spotard.png'],
  },
  alternates: {
    canonical: 'https://v0-spotard.vercel.app',
  }
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              'name': 'spotard',
              'url': 'https://v0-spotard.vercel.app',
              'description': 'Интерактивная карта спотов: находи и добавляй места для трюков на скейте, самокате, роликах и BMX.',
              'applicationCategory': 'UtilitiesApplication',
              'operatingSystem': 'All',
            }),
          }}
        />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
