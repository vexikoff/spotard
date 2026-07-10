'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import Pusher from 'pusher-js'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  approveReportAndDeleteSpot,
  changeUsername,
  createSpot,
  deleteMessage,
  deleteSpot,
  dismissReport,
  getIpLocation,
  getMessages,
  getOpenReports,
  getSpots,
  reportSpot,
  sendMessage,
  updateSpot,
  toggleLikeSpot,
  pingOnline,
  getUsersList,
  toggleBanUser,
  type SpotInput,
} from '@/app/actions/spots'
import type { SpotCluster } from '@/components/spot-map'
import type { Spot } from '@/lib/db/schema'
import { MAP_STYLES, SPOT_CATEGORIES, SPOT_TYPES, getUserRole } from '@/lib/spot-config'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import SpotPanel from '@/components/spot-panel'

const SpotMap = dynamic(() => import('@/components/spot-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <p className="font-mono text-sm text-muted-foreground">Загрузка карты...</p>
    </div>
  ),
})

type DraftPoint = { lat: number; lng: number }
type PanelMode = 'create' | 'view' | 'edit' | null

export default function MapApp({ initialSpots }: { initialSpots: Spot[] }) {
  const router = useRouter()
  const { data: session, isPending: sessionLoading } = authClient.useSession()
  const currentUserId = session?.user?.id ?? null
  const role = getUserRole(session?.user?.email, session?.user?.name)
  const isAdmin = role === 'admin'
  const isStaff = role === 'admin' || role === 'moderator'

  const { data: spots = initialSpots, mutate } = useSWR('spots', () => getSpots(), {
    fallbackData: initialSpots,
    refreshInterval: 60000,
  })

  const { data: openReports = [], mutate: mutateReports } = useSWR(
    isStaff ? 'reports' : null,
    () => getOpenReports(),
  )
  const [reportsOpen, setReportsOpen] = useState(false)
  const [reportBusy, setReportBusy] = useState<number | null>(null)

  const [mode, setMode] = useState<PanelMode>(null)
  const [draft, setDraft] = useState<DraftPoint | null>(null)
  const [selected, setSelected] = useState<Spot | null>(null)
  const [draftType, setDraftType] = useState('street')
  const [flyTarget, setFlyTarget] = useState<DraftPoint | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mapStyle, setMapStyle] = useState('dark')
  const [notice, setNotice] = useState('')
  const [legendOpen, setLegendOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [statsData, setStatsData] = useState<{ online: number; spots: number; users: number } | null>(null)

  const [newName, setNewName] = useState('')
  const [nameUpdating, setNameUpdating] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)

  useEffect(() => {
    if (session?.user?.name) {
      setNewName(session.user.name)
    }
  }, [session?.user?.name])

  const [onboardingOpen, setOnboardingOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const visited = localStorage.getItem('spotard_visited')
      if (!visited) {
        setOnboardingOpen(true)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const tg = (window as any).Telegram?.WebApp
    if (tg && tg.initData && !session?.user) {
      async function autoLogin() {
        try {
          const res = await fetch('/api/auth/telegram/webapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData }),
          })
          if (res.ok) {
            window.location.reload()
          }
        } catch (e) {
          console.error('Telegram WebApp automatic login failed:', e)
        }
      }
      autoLogin()
    }
  }, [session])

  const [clientId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('spotard_client_id')
      if (!id) {
        id = Math.random().toString(36).substring(2, 15)
        sessionStorage.setItem('spotard_client_id', id)
      }
      return id
    }
    return ''
  })

  useEffect(() => {
    if (!clientId) return

    async function fetchStats() {
      try {
        const data = await pingOnline(clientId)
        setStatsData(data)
      } catch (err) {
        console.error('Stats fetch error:', err)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [clientId])

  const [usersList, setUsersList] = useState<any[]>([])

  useEffect(() => {
    if (statsOpen && isAdmin) {
      getUsersList().then(setUsersList).catch(console.error)
    }
  }, [statsOpen, isAdmin])

  // Filters + search
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const filteredSpots = spots.filter((s) => {
    if (typeFilter.size > 0 && !typeFilter.has(s.spotType)) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
        s.tags.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      )
    }
    return true
  })

  function toggleTypeFilter(t: string) {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  // Cluster list
  const [cluster, setCluster] = useState<SpotCluster | null>(null)
  const handleClusterClick = useCallback((c: SpotCluster) => {
    setCluster(c)
    setMode(null)
    setFlyTarget({ lat: c.lat, lng: c.lng })
  }, [])

  // Chat
  const [chatOpen, setChatOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const chatOpenRef = useRef(chatOpen)

  useEffect(() => {
    chatOpenRef.current = chatOpen
    if (chatOpen) {
      setHasUnread(false)
    }
  }, [chatOpen])

  const { data: chatMessages = [], mutate: mutateChat } = useSWR(
    chatOpen ? 'chat' : null,
    () => getMessages(),
    { refreshInterval: 60000 },
  )
  const [chatText, setChatText] = useState('')

  // Real-time updates via Pusher
  useEffect(() => {
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY || '7e1bccd74cc3954ced0d'
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'eu'

    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
    })

    const channel = pusher.subscribe('spots')

    channel.bind('created', () => {
      mutate()
    })
    channel.bind('updated', () => {
      mutate()
    })
    channel.bind('deleted', () => {
      mutate()
    })
    channel.bind('message_created', () => {
      mutateChat()
      if (!chatOpenRef.current) {
        setHasUnread(true)
      }
    })
    channel.bind('message_deleted', () => {
      mutateChat()
    })

    return () => {
      channel.unbind_all()
      channel.unsubscribe()
      pusher.disconnect()
    }
  }, [mutate, mutateChat])
  const [chatSending, setChatSending] = useState(false)

  async function handleSendMessage() {
    if (!chatText.trim() || chatSending) return
    setChatSending(true)
    try {
      await sendMessage(chatText)
      setChatText('')
      await mutateChat()
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setChatSending(false)
    }
  }

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Geolocation (моё местоположение)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  function locateMe() {
    if (!navigator.geolocation) {
      fallbackToIpLocation()
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLocation(coords)
        setFlyTarget(coords)
      },
      () => {
        fallbackToIpLocation()
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 600000,
      }
    )
  }

  async function fallbackToIpLocation() {
    try {
      const loc = await getIpLocation()
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        setUserLocation(loc)
        setFlyTarget(loc)
      } else {
        flashNotice('Не удалось определить местоположение')
      }
    } catch (err) {
      console.error('Fallback location search error:', err)
      flashNotice('Не удалось определить местоположение')
    }
  }

  function flashNotice(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const handleMapClick = useCallback(
    (p: DraftPoint) => {
      if (!currentUserId) {
        setNotice('Войди в аккаунт, чтобы добавлять споты')
        window.setTimeout(() => setNotice(''), 3500)
        return
      }
      setDraft(p)
      setSelected(null)
      setDraftType('street')
      setMode('create')
    },
    [currentUserId],
  )

  const handleSpotClick = useCallback((spot: Spot) => {
    setSelected(spot)
    setDraft(null)
    setMode('view')
    setFlyTarget({ lat: spot.lat, lng: spot.lng })
  }, [])

  const closePanel = useCallback(() => {
    setMode(null)
    setDraft(null)
    setSelected(null)
  }, [])

  async function handleSubmit(input: SpotInput) {
    setSaving(true)
    try {
      if (mode === 'edit' && selected) {
        const updated = await updateSpot(selected.id, input)
        await mutate()
        setSelected(updated)
        setMode('view')
      } else {
        await createSpot(input)
        await mutate()
        closePanel()
      }
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Не удалось сохранить спот')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    try {
      await deleteSpot(selected.id)
      await mutate()
      closePanel()
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Не удалось удалить спот')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
    router.refresh()
  }

  async function handleReport(reason: string) {
    if (!selected) return
    try {
      await reportSpot(selected.id, reason)
      if (isStaff) await mutateReports()
      flashNotice('Жалоба отправлена')
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Не удалось отправить жалобу')
      throw err
    }
  }

  async function handleLike(spotId: number) {
    try {
      await toggleLikeSpot(spotId)
      await mutate()
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Ошибка')
    }
  }

  async function handleApproveReport(reportId: number) {
    setReportBusy(reportId)
    try {
      await approveReportAndDeleteSpot(reportId)
      await Promise.all([mutate(), mutateReports()])
      flashNotice('Спот удалён по жалобе')
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setReportBusy(null)
    }
  }

  async function handleDismissReport(reportId: number) {
    setReportBusy(reportId)
    try {
      await dismissReport(reportId)
      await mutateReports()
      flashNotice('Жалоба отклонена')
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setReportBusy(null)
    }
  }

  const accountBadge = sessionLoading ? null : session?.user ? (
    <div className="flex items-center gap-2 rounded-xl bg-black/85 py-1.5 pr-1.5 pl-3.5 shadow-2xl backdrop-blur-md">
      <span className="max-w-44 md:max-w-none truncate text-xs font-bold text-white">
        {session.user.name}
        {role !== 'user' && (
          <span className="ml-1.5 font-mono text-[9px] tracking-wider text-primary uppercase">
            {role === 'admin' ? 'админ' : 'модер'}
          </span>
        )}
      </span>
      <button
        onClick={handleSignOut}
        className="rounded-lg bg-white/10 px-2.5 py-1.5 font-mono text-xs text-white/70 transition-colors hover:bg-white/20 hover:text-white"
      >
        Выйти
      </button>
    </div>
  ) : (
    <Link
      href="/sign-in"
      className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-black shadow-2xl transition-opacity hover:opacity-85"
    >
      Войти
    </Link>
  )

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <SpotMap
        spots={filteredSpots}
        draft={mode === 'create' ? draft : null}
        draftType={draftType}
        flyTarget={flyTarget}
        mapStyle={mapStyle}
        userLocation={userLocation}
        onMapClick={handleMapClick}
        onSpotClick={handleSpotClick}
        onClusterClick={handleClusterClick}
      />

      {/* Desktop Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] hidden md:flex items-start justify-between gap-2 p-4">
        <div className="pointer-events-auto flex shrink-0 items-center gap-3 rounded-xl bg-black/85 px-4 py-2.5 shadow-2xl backdrop-blur-md">
          <Image
            src="/images/spotard.png"
            alt="Логотип spotard"
            width={32}
            height={32}
            className="size-8 rounded-lg grayscale"
            priority
          />
          <div className="flex flex-col">
            <span className="font-display text-base leading-tight font-semibold tracking-tight text-white lowercase">
              spotard
            </span>
            <span className="font-mono text-[10px] leading-tight text-white/50 uppercase">
              {spots.length} {spotWord(spots.length)}
            </span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center justify-end gap-2">
          {/* Search */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: название, теги..."
            aria-label="Поиск спотов"
            className="w-52 rounded-xl bg-black/85 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-white/40 shadow-2xl backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/60"
          />

          {/* Chat */}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            aria-expanded={chatOpen}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
              chatOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
            )}
          >
            Чат
            {hasUnread && (
              <span className="relative flex size-2">
                <span className="absolute -inset-[1px] inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
              </span>
            )}
          </button>

          {/* Telegram channel */}
          <a
            href="https://t.me/spotard"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram"
            className="rounded-xl bg-black/85 px-3.5 py-2.5 font-mono text-xs font-bold text-white/80 shadow-2xl backdrop-blur-md transition-colors hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="inline">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.718-1.077 4.996-1.528 7.375-.192 1.01-.564 1.348-.923 1.38-.78.07-1.372-.516-2.128-1.012-1.184-.777-1.854-1.258-3.003-2.015-1.328-.875-.467-1.357.29-2.143.198-.206 3.636-3.334 3.702-3.616.008-.035.015-.166-.062-.234-.078-.068-.193-.045-.276-.026-.118.027-2.003 1.272-5.65 3.727-.534.366-1.019.546-1.454.537-.48-.01-1.403-.27-2.09-.494-.842-.274-1.512-.42-1.454-.886.03-.243.364-.492.999-.748 3.914-1.704 6.522-2.829 7.822-3.376 3.724-1.56 4.498-1.83 5.003-1.84.111-.002.359.025.519.155.135.109.172.256.186.368.014.114.02.385.01.554z"/>
            </svg>
          </a>

          {/* Settings */}
          {/* Settings */}
          <button
            onClick={() => {
              setSettingsOpen(!settingsOpen)
              setReportsOpen(false)
              setStatsOpen(false)
            }}
            aria-expanded={settingsOpen}
            aria-label="Настройки"
            className={cn(
              'rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
              settingsOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
            )}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="inline">
              <path
                d="M8 10a2 2 0 100-4 2 2 0 000 4zM13 8c0-.35-.04-.7-.1-1.03l1.4-1.09-1.3-2.26-1.66.67a5 5 0 00-1.78-1.03L9.3 1.5H6.7l-.26 1.76a5 5 0 00-1.78 1.03l-1.66-.67-1.3 2.26 1.4 1.09A5.1 5.1 0 003 8c0 .35.04.7.1 1.03l-1.4 1.09 1.3 2.26 1.66-.67c.52.46 1.12.81 1.78 1.03l.26 1.76h2.6l.26-1.76a5 5 0 001.78-1.03l1.66.67 1.3-2.26-1.4-1.09c.06-.34.1-.68.1-1.03z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </button>

          {/* Staff: reports */}
          {isStaff && (
            <button
              onClick={() => {
                setReportsOpen(!reportsOpen)
                setSettingsOpen(false)
                setStatsOpen(false)
              }}
              aria-expanded={reportsOpen}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
                reportsOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
              )}
            >
              Жалобы
              {openReports.length > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {openReports.length}
                </span>
              )}
            </button>
          )}

          {/* Admin: statistics */}
          {isAdmin && (
            <button
              onClick={() => {
                setStatsOpen(!statsOpen)
                setReportsOpen(false)
                setSettingsOpen(false)
              }}
              aria-expanded={statsOpen}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
                statsOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
              )}
            >
              Статистика
            </button>
          )}

          {/* Account */}
          {accountBadge}
        </div>
      </header>

      {/* Mobile Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex md:hidden flex-col gap-3 p-3">
        {/* Top row: Logo on left, Account on right */}
        <div className="flex w-full items-center justify-between gap-3">
          <div className="pointer-events-auto flex shrink-0 items-center gap-2.5 rounded-xl bg-black/85 px-3 py-2 shadow-2xl backdrop-blur-md">
            <Image
              src="/images/spotard.png"
              alt="Логотип spotard"
              width={32}
              height={32}
              className="size-7 rounded-lg grayscale"
              priority
            />
            <div className="flex flex-col">
              <span className="font-display text-sm leading-tight font-semibold tracking-tight text-white lowercase">
                spotard
              </span>
              <span className="font-mono text-[10px] leading-tight text-white/50 uppercase">
                {spots.length} {spotWord(spots.length)}
              </span>
            </div>
          </div>

          <div className="pointer-events-auto">
            {accountBadge}
          </div>
        </div>

        {/* Bottom row: Search on left, Chat button on right */}
        <div className="flex w-full items-center justify-between gap-2">
          <div className="pointer-events-auto flex-1">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск: название, теги..."
              aria-label="Поиск спотов"
              className="w-full rounded-xl bg-black/85 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-white/40 shadow-2xl backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
          </div>

          <div className="pointer-events-auto shrink-0">
            <button
              onClick={() => setChatOpen(!chatOpen)}
              aria-expanded={chatOpen}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
                chatOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
              )}
            >
              Чат
              {hasUnread && (
                <span className="relative flex size-2">
                  <span className="absolute -inset-[1px] inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Floating Utility stack on mobile */}
        <div className="pointer-events-auto flex flex-col items-end gap-2 absolute right-3 top-[112px] z-[1000]">
          {/* Telegram channel */}
          <a
            href="https://t.me/spotard"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram"
            className="rounded-xl bg-black/85 px-3.5 py-2.5 font-mono text-xs font-bold text-white/80 shadow-2xl backdrop-blur-md transition-colors hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="inline">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.718-1.077 4.996-1.528 7.375-.192 1.01-.564 1.348-.923 1.38-.78.07-1.372-.516-2.128-1.012-1.184-.777-1.854-1.258-3.003-2.015-1.328-.875-.467-1.357.29-2.143.198-.206 3.636-3.334 3.702-3.616.008-.035.015-.166-.062-.234-.078-.068-.193-.045-.276-.026-.118.027-2.003 1.272-5.65 3.727-.534.366-1.019.546-1.454.537-.48-.01-1.403-.27-2.09-.494-.842-.274-1.512-.42-1.454-.886.03-.243.364-.492.999-.748 3.914-1.704 6.522-2.829 7.822-3.376 3.724-1.56 4.498-1.83 5.003-1.84.111-.002.359.025.519.155.135.109.172.256.186.368.014.114.02.385.01.554z"/>
            </svg>
          </a>

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-expanded={settingsOpen}
            aria-label="Настройки"
            className={cn(
              'rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
              settingsOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
            )}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="inline">
              <path
                d="M8 10a2 2 0 100-4 2 2 0 000 4zM13 8c0-.35-.04-.7-.1-1.03l1.4-1.09-1.3-2.26-1.66.67a5 5 0 00-1.78-1.03L9.3 1.5H6.7l-.26 1.76a5 5 0 00-1.78 1.03l-1.66-.67-1.3 2.26 1.4 1.09A5.1 5.1 0 003 8c0 .35.04.7.1 1.03l-1.4 1.09 1.3 2.26 1.66-.67c.52.46 1.12.81 1.78 1.03l.26 1.76h2.6l.26-1.76a5 5 0 001.78-1.03l1.66.67 1.3-2.26-1.4-1.09c.06-.34.1-.68.1-1.03z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </button>

          {/* Staff: reports */}
          {isStaff && (
            <button
              onClick={() => setReportsOpen(!reportsOpen)}
              aria-expanded={reportsOpen}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
                reportsOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
              )}
            >
              Жалобы
              {openReports.length > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {openReports.length}
                </span>
              )}
            </button>
          )}

          {/* Admin: statistics on mobile */}
          {isAdmin && (
            <button
              onClick={() => {
                setStatsOpen(!statsOpen)
                setReportsOpen(false)
                setSettingsOpen(false)
              }}
              aria-expanded={statsOpen}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
                statsOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
              )}
            >
              Стата
            </button>
          )}
        </div>
      </header>

      {/* Staff reports panel */}
      {isStaff && reportsOpen && (
        <div className="pointer-events-auto absolute top-20 right-4 z-[1050] flex max-h-[60dvh] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl bg-card/95 shadow-2xl backdrop-blur-md md:w-96">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-display text-base font-semibold">Жалобы</h2>
            <button
              onClick={() => setReportsOpen(false)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Закрыть жалобы"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-5">
            {openReports.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">Открытых жалоб нет</p>
            ) : (
              openReports.map((r) => {
                const reportedSpot = spots.find((s) => s.id === r.spotId)
                return (
                  <div key={r.id} className="flex flex-col gap-2 rounded-xl bg-secondary p-4">
                    <button
                      onClick={() => {
                        if (reportedSpot) {
                          handleSpotClick(reportedSpot)
                          setReportsOpen(false)
                        }
                      }}
                      disabled={!reportedSpot}
                      className="text-left text-sm font-bold underline-offset-4 hover:underline disabled:no-underline"
                    >
                      {r.spotName ?? 'Спот удалён'}
                    </button>
                    <p className="text-sm leading-relaxed text-muted-foreground">{r.reason}</p>
                    <p className="font-mono text-[10px] text-muted-foreground uppercase">От: {r.reporterName}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveReport(r.id)}
                        disabled={reportBusy === r.id}
                        className="flex-1 rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                      >
                        {reportBusy === r.id ? '...' : 'Уд��лить спот'}
                      </button>
                      <button
                        onClick={() => handleDismissReport(r.id)}
                        disabled={reportBusy === r.id}
                        className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs font-bold text-foreground transition-opacity hover:opacity-85 disabled:opacity-50"
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Notice toast */}
      {notice && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-[1100] flex justify-center px-4">
          <p className="rounded-xl bg-black/90 px-5 py-3 text-sm font-medium text-white shadow-2xl backdrop-blur-md">
            {notice}
          </p>
        </div>
      )}

      {/* Legend / type filter */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-[1000]">
        <div className="pointer-events-auto flex max-h-[50dvh] w-56 flex-col overflow-hidden rounded-xl bg-black/85 shadow-2xl backdrop-blur-md">
          <button
            onClick={() => setLegendOpen(!legendOpen)}
            aria-expanded={legendOpen}
            className="flex items-center justify-between gap-6 px-4 py-3 text-left"
          >
            <span className="font-mono text-[10px] font-bold tracking-widest text-white/60 uppercase">
              Типы спотов {typeFilter.size > 0 && `(${typeFilter.size})`}
            </span>
            <span className="font-mono text-xs text-white/40">{legendOpen ? '−' : '+'}</span>
          </button>
          {legendOpen && (
            <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
              {typeFilter.size > 0 && (
                <button
                  onClick={() => setTypeFilter(new Set())}
                  className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-[10px] text-white/80 uppercase transition-colors hover:bg-white/20"
                >
                  Сбросить фильтр
                </button>
              )}
              {SPOT_CATEGORIES.map((cat) => (
                <div key={cat.value} className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] tracking-wider text-white/40 uppercase">{cat.label}</span>
                  {SPOT_TYPES.filter((t) => t.category === cat.value).map((t) => (
                    <button
                      key={t.value}
                      onClick={() => toggleTypeFilter(t.value)}
                      aria-pressed={typeFilter.has(t.value)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors',
                        typeFilter.has(t.value)
                          ? 'bg-white/15 font-bold text-white'
                          : 'text-white/70 hover:text-white',
                      )}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                      {t.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* My location */}
      <button
        onClick={locateMe}
        aria-label="Найти меня"
        className="pointer-events-auto absolute right-4 bottom-4 z-[1000] flex size-11 items-center justify-center rounded-xl bg-black/85 text-white/80 shadow-2xl backdrop-blur-md transition-colors hover:text-white"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {/* Settings panel */}
      {settingsOpen && (
        <div className="pointer-events-auto absolute top-32 right-4 z-[1050] flex w-[calc(100%-2rem)] flex-col gap-4 rounded-2xl bg-card/95 p-5 shadow-2xl backdrop-blur-md md:top-20 md:w-72">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Настройки</h2>
            <button
              onClick={() => setSettingsOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Закрыть настройки"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Вид карты</span>
            <div className="flex rounded-lg bg-secondary p-1" role="radiogroup" aria-label="Вид карты">
              {MAP_STYLES.map((s) => (
                <button
                  key={s.value}
                  role="radio"
                  aria-checked={mapStyle === s.value}
                  onClick={() => setMapStyle(s.value)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 font-mono text-[11px] transition-colors',
                    mapStyle === s.value ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Фильтры</span>
            <button
              onClick={() => {
                setTypeFilter(new Set())
                setSearch('')
              }}
              className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Сбросить всё ({filteredSpots.length}/{spots.length} на карте)
            </button>
          </div>

          {session?.user && (
            <div className="flex flex-col gap-1.5 border-t border-border/20 pt-3">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Сменить ник</span>
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Новый ник"
                  maxLength={40}
                  className="flex-1 rounded-lg bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  disabled={nameUpdating || !newName.trim() || newName === session.user.name}
                  onClick={async () => {
                    setNameUpdating(true)
                    setNameError(null)
                    try {
                      const res = await changeUsername(newName)
                      if (res.success) {
                        window.location.reload()
                      } else {
                        setNameError(res.error || 'Ошибка')
                      }
                    } catch (err: any) {
                      setNameError(err.message || 'Ошибка')
                    } finally {
                      setNameUpdating(false)
                    }
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {nameUpdating ? '...' : 'ОК'}
                </button>
              </div>
              {nameError && <p className="text-[10px] font-mono text-destructive">{nameError}</p>}
            </div>
          )}

          <div className="flex flex-col gap-1.5 border-t border-border/20 pt-3">
            <div className="flex justify-center gap-4 font-mono text-[9px] text-muted-foreground">
              <button onClick={() => setPrivacyOpen(true)} className="hover:underline">Политика</button>
              <button onClick={() => setTermsOpen(true)} className="hover:underline">Условия</button>
            </div>
            <div className="text-center font-mono text-[8px] text-muted-foreground/60 mt-1">
              Создатели:{" "}
              <a href="https://github.com/vexikoff" target="_blank" rel="noreferrer" className="hover:underline text-muted-foreground font-bold">vexikoff</a>
              {", "}
              <a href="https://github.com/clausmaslov" target="_blank" rel="noreferrer" className="hover:underline text-muted-foreground font-bold">claus_maslov</a>
            </div>
          </div>
        </div>
      )}

      {/* Chat panel */}
      {chatOpen && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1060] flex h-[55dvh] flex-col rounded-t-2xl bg-card/95 shadow-2xl backdrop-blur-md md:inset-x-auto md:top-20 md:right-4 md:bottom-4 md:h-auto md:w-80 md:rounded-2xl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-display text-sm font-semibold">Чат райдеров</h2>
            <button
              onClick={() => setChatOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Закрыть чат"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex flex-1 flex-col-reverse gap-2 overflow-y-auto px-5 py-2">
            {[...chatMessages].reverse().map((m) => (
              <div key={m.id} className={cn('flex max-w-[85%] flex-col gap-0.5 rounded-xl px-3 py-2', m.userId === currentUserId ? 'self-end bg-primary/20' : 'self-start bg-secondary')}>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-[9px] font-bold text-primary uppercase">{m.authorName}</span>
                  {isStaff && (
                    <button
                      onClick={async () => {
                        await deleteMessage(m.id)
                        await mutateChat()
                      }}
                      className="font-mono text-[9px] text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Удалить сообщение"
                    >
                      удалить
                    </button>
                  )}
                </div>
                <p className="text-sm leading-snug">{m.text}</p>
              </div>
            ))}
            {chatMessages.length === 0 && (
              <p className="font-mono text-xs text-muted-foreground">Пока тихо — напиши первым</p>
            )}
          </div>
          <div className="flex gap-2 p-4">
            {currentUserId ? (
              <>
                <input
                  className="w-full rounded-lg bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) handleSendMessage()
                  }}
                  placeholder="Сообщение..."
                  maxLength={400}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={chatSending || !chatText.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {chatSending ? '...' : '→'}
                </button>
              </>
            ) : (
              <Link href="/sign-in" className="w-full rounded-lg bg-secondary px-3.5 py-2.5 text-center text-sm text-muted-foreground">
                Войди, чтобы писать в чат
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Cluster list panel */}
      {cluster && !mode && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1050] flex max-h-[50dvh] flex-col rounded-t-2xl bg-card/95 shadow-2xl backdrop-blur-md md:inset-x-auto md:top-20 md:right-4 md:bottom-auto md:w-80 md:rounded-2xl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-display text-sm font-semibold">
              {cluster.spots.length} {spotWord(cluster.spots.length)} здесь
            </h2>
            <button
              onClick={() => setCluster(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Закрыть список"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto px-5 pb-5">
            {cluster.spots.map((s) => {
              const t = SPOT_TYPES.find((x) => x.value === s.spotType)
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setCluster(null)
                    handleSpotClick(s)
                  }}
                  className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3 text-left transition-colors hover:bg-accent"
                >
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: t?.color ?? '#fff' }} aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">{s.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{t?.label ?? s.spotType}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {isAdmin && statsOpen && (
        <aside className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-2xl bg-card/95 p-5 shadow-2xl backdrop-blur-md md:inset-x-auto md:top-20 md:right-4 md:bottom-4 md:h-fit md:w-95 md:rounded-2xl">
          <div className="flex items-center justify-between pb-3">
            <h2 className="font-display text-base font-semibold text-white">Статистика сайта</h2>
            <button
              onClick={() => setStatsOpen(false)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Закрыть статистику"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-4 py-2 font-mono text-sm">
            <div className="flex justify-between bg-secondary p-3 rounded-lg">
              <span className="text-muted-foreground uppercase text-xs tracking-wider">Актуальный онлайн:</span>
              <span className="font-bold text-white">{statsData?.online ?? 1}</span>
            </div>
            <div className="flex justify-between bg-secondary p-3 rounded-lg">
              <span className="text-muted-foreground uppercase text-xs tracking-wider">Всего спотов:</span>
              <span className="font-bold text-white">{statsData?.spots ?? 0}</span>
            </div>
            <div className="flex justify-between bg-secondary p-3 rounded-lg">
              <span className="text-muted-foreground uppercase text-xs tracking-wider">Число аккаунтов:</span>
              <span className="font-bold text-white">{statsData?.users ?? 0}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 pt-2">
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Список пользователей ({usersList.length})</span>
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1">
              {usersList.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-lg bg-secondary p-2.5 font-mono text-xs">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-white truncate">{u.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{u.email}</span>
                  </div>
                  {u.id !== currentUserId && (
                    <button
                      onClick={async () => {
                        try {
                          await toggleBanUser(u.id)
                          const updated = await getUsersList()
                          setUsersList(updated)
                        } catch (err) {
                          alert(err instanceof Error ? err.message : 'Ошибка')
                        }
                      }}
                      className={cn(
                        "rounded px-2.5 py-1 text-[10px] font-bold uppercase transition-colors",
                        u.banned
                          ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : "bg-destructive/10 text-destructive-foreground hover:bg-destructive/20"
                      )}
                    >
                      {u.banned ? 'Разбан' : 'Бан'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {mode && (
        <SpotPanel
          mode={mode}
          draft={draft}
          spot={selected ? spots.find((s) => s.id === selected.id) || selected : null}
          saving={saving}
          deleting={deleting}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          isStaff={isStaff}
          onTypeChange={setDraftType}
          onSubmit={handleSubmit}
          onEdit={() => setMode('edit')}
          onDelete={handleDelete}
          onReport={handleReport}
          onClose={closePanel}
          onLike={handleLike}
        />
      )}

      {/* Onboarding Modal */}
      {onboardingOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-w-sm flex-col gap-5 rounded-2xl bg-card p-6 shadow-2xl border border-border/10">
            <div className="text-center">
              <h3 className="font-display text-lg font-bold text-primary lowercase tracking-tight">spotard</h3>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Твой гид по спотам</p>
            </div>
            <div className="flex flex-col gap-3.5 text-xs text-muted-foreground font-mono leading-relaxed">
              <p className="text-sm text-foreground text-center font-sans">
                Интерактивная карта спотов для скейтборда, BMX, самоката и роликов.
              </p>
              <div className="flex flex-col gap-3.5 bg-secondary/35 p-4 rounded-xl border border-border/5">
                <div className="flex gap-3 items-start">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0 size-4 mt-0.5">
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                    <line x1="9" y1="3" x2="9" y2="18" />
                    <line x1="15" y1="6" x2="15" y2="21" />
                  </svg>
                  <span>Находи лучшие места в своем городе</span>
                </div>
                <div className="flex gap-3 items-start">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0 size-4 mt-0.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>Добавляй новые споты кликом по карте</span>
                </div>
                <div className="flex gap-3 items-start">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0 size-4 mt-0.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Общайся в реальном времени в чате</span>
                </div>
                <div className="flex gap-3 items-start">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0 size-4 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>Следи за состоянием и опасностью спотов</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.setItem('spotard_visited', 'true')
                setOnboardingOpen(false)
              }}
              className="w-full rounded-xl bg-primary py-3 text-center text-xs font-bold font-mono uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90"
            >
              Погнали!
            </button>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {privacyOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-w-md flex-col gap-4 rounded-2xl bg-card p-6 shadow-2xl border border-border/10">
            <div className="flex items-center justify-between border-b border-border/10 pb-2">
              <h3 className="font-display text-sm font-semibold">Политика конфиденциальности</h3>
              <button onClick={() => setPrivacyOpen(false)} className="text-muted-foreground hover:text-foreground">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto pr-1 text-xs leading-relaxed text-muted-foreground flex flex-col gap-3 font-mono">
              <p>
                1. Мы собираем ваш email исключительно для регистрации, входа и безопасности вашего аккаунта.
              </p>
              <p>
                2. Ваши личные геоданные не передаются третьим лицам. Местоположение спотов, которые вы добавляете, становится публичным для всех пользователей.
              </p>
              <p>
                3. Мы используем файлы cookie для поддержания сессии вашего входа.
              </p>
            </div>
            <button
              onClick={() => setPrivacyOpen(false)}
              className="w-full rounded-xl bg-secondary py-2.5 text-center text-xs font-bold font-mono uppercase text-foreground hover:bg-secondary/80 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Terms of Use Modal */}
      {termsOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-w-md flex-col gap-4 rounded-2xl bg-card p-6 shadow-2xl border border-border/10">
            <div className="flex items-center justify-between border-b border-border/10 pb-2">
              <h3 className="font-display text-sm font-semibold">Условия использования</h3>
              <button onClick={() => setTermsOpen(false)} className="text-muted-foreground hover:text-foreground">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto pr-1 text-xs leading-relaxed text-muted-foreground flex flex-col gap-3 font-mono">
              <p>
                1. Запрещено добавлять несуществующие (фейковые) споты, дубликаты или рекламу.
              </p>
              <p>
                2. Запрещено спамить или оскорблять участников в общем чате.
              </p>
              <p>
                3. Администрация оставляет за собой право модерировать споты, удалять некорректный контент и блокировать учетные записи нарушителей.
              </p>
              <p>
                4. Пожалуйста, будьте осторожны при посещении спотов и соблюдайте правила безопасности.
              </p>
            </div>
            <button
              onClick={() => setTermsOpen(false)}
              className="w-full rounded-xl bg-secondary py-2.5 text-center text-xs font-bold font-mono uppercase text-foreground hover:bg-secondary/80 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function spotWord(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'спотов'
  if (mod10 === 1) return 'спот'
  if (mod10 >= 2 && mod10 <= 4) return 'спота'
  return 'спотов'
}
