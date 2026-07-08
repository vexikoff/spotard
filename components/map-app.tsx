'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import Pusher from 'pusher-js'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  approveReportAndDeleteSpot,
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
  function locateMe() {
    if (!navigator.geolocation) {
      fallbackToIpLocation()
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setFlyTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        fallbackToIpLocation()
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 600000,
      }
    )
  }

  async function fallbackToIpLocation() {
    try {
      const loc = await getIpLocation()
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        setFlyTarget({ lat: loc.lat, lng: loc.lng })
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
        onMapClick={handleMapClick}
        onSpotClick={handleSpotClick}
        onClusterClick={handleClusterClick}
      />

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col md:flex-row md:items-start justify-between gap-3 p-3 md:p-4">
        {/* Top row: Logo on left, Account on right (mobile-only) */}
        <div className="flex w-full md:w-auto items-center justify-between md:justify-start gap-3">
          <div className="pointer-events-auto flex shrink-0 items-center gap-2.5 rounded-xl bg-black/85 px-3 py-2 shadow-2xl backdrop-blur-md md:gap-3 md:px-4 md:py-2.5">
            <Image
              src="/images/spotard.png"
              alt="Логотип spotard"
              width={32}
              height={32}
              className="size-7 rounded-lg grayscale md:size-8"
              priority
            />
            <div className="flex flex-col">
              <span className="font-display text-sm leading-tight font-semibold tracking-tight text-white lowercase md:text-base">
                spotard
              </span>
              <span className="font-mono text-[10px] leading-tight text-white/50 uppercase">
                {spots.length} {spotWord(spots.length)}
              </span>
            </div>
          </div>

          {/* Account badge on top-right (mobile only) */}
          <div className="pointer-events-auto md:hidden">
            {accountBadge}
          </div>
        </div>

        {/* Bottom row / Inline block: Search and action buttons */}
        <div className="flex w-full md:w-auto flex-col md:flex-row items-stretch md:items-center gap-2">
          {/* Search: full-width on mobile, 208px wide on desktop */}
          <div className="pointer-events-auto w-full md:w-auto">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск: название, теги..."
              aria-label="Поиск спотов"
              className="w-full md:w-52 rounded-xl bg-black/85 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-white/40 shadow-2xl backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
          </div>

          {/* Utility / Action buttons: vertical stack floating on the right side on mobile, horizontal row next to search on desktop */}
          <div className="pointer-events-auto flex flex-col md:flex-row items-end md:items-center gap-2 absolute md:static right-3 top-[72px] md:top-auto md:right-auto z-[1000]">
            {/* Chat */}
            <button
              onClick={() => setChatOpen(!chatOpen)}
              aria-expanded={chatOpen}
              className={cn(
                'rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold shadow-2xl backdrop-blur-md transition-colors',
                chatOpen ? 'bg-white text-black' : 'bg-black/85 text-white/80 hover:text-white',
              )}
            >
              Чат
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
          </div>

          {/* Account badge on inline list (desktop only) */}
          <div className="pointer-events-auto hidden md:block">
            {accountBadge}
          </div>
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

      {mode && (
        <SpotPanel
          mode={mode}
          draft={draft}
          spot={selected}
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
        />
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
