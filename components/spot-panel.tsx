'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import type { Spot } from '@/lib/db/schema'
import { addComment, deleteComment, getComments, type SpotInput } from '@/app/actions/spots'
import {
  SECURITY_LEVELS,
  SPOT_CATEGORIES,
  SPOT_TYPES,
  SURFACES,
  getSecurity,
  getSpotType,
  getSurfaceLabel,
} from '@/lib/spot-config'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type DraftPoint = { lat: number; lng: number }

const inputClass =
  'w-full rounded-lg bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{children}</span>
}

function SpotForm({
  point,
  initial,
  saving,
  onTypeChange,
  onSubmit,
  onCancel,
}: {
  point: DraftPoint
  initial?: Spot
  saving: boolean
  onTypeChange: (t: string) => void
  onSubmit: (input: SpotInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [spotType, setSpotType] = useState(initial?.spotType ?? 'street')
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 3)
  const [surface, setSurface] = useState(initial?.surface ?? 'concrete')
  const [security, setSecurity] = useState(initial?.security ?? 'chill')
  const [lighting, setLighting] = useState(initial?.lighting ?? false)
  const [covered, setCovered] = useState(initial?.covered ?? false)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tags, setTags] = useState(initial?.tags ?? '')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Дай споту название')
      return
    }
    setError('')
    onSubmit({
      name,
      lat: point.lat,
      lng: point.lng,
      spotType,
      difficulty,
      surface,
      security,
      lighting,
      covered,
      description,
      tags,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Название спота</FieldLabel>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Рейл у ТЦ"
          maxLength={80}
          autoFocus
        />
      </label>

      <div className="flex flex-col gap-3">
        <FieldLabel>Тип спота</FieldLabel>
        {SPOT_CATEGORIES.map((cat) => (
          <div key={cat.value} className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70 uppercase">
              {cat.label}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {SPOT_TYPES.filter((t) => t.category === cat.value).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setSpotType(t.value)
                    onTypeChange(t.value)
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    spotType === t.value
                      ? 'bg-primary/20 font-semibold text-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color }}
                    aria-hidden="true"
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel>Сложность</FieldLabel>
        <div className="flex gap-2" role="radiogroup" aria-label="Сложность от 1 до 5">
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={difficulty === d}
              onClick={() => setDifficulty(d)}
              className={cn(
                'flex h-10 flex-1 items-center justify-center rounded-lg font-mono text-sm font-bold transition-colors',
                difficulty >= d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <FieldLabel>Покрытие</FieldLabel>
          <select className={inputClass} value={surface} onChange={(e) => setSurface(e.target.value)}>
            {SURFACES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <FieldLabel>Охрана</FieldLabel>
          <select className={inputClass} value={security} onChange={(e) => setSecurity(e.target.value)}>
            {SECURITY_LEVELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setLighting(!lighting)}
          aria-pressed={lighting}
          className={cn(
            'rounded-lg px-3 py-2.5 text-sm transition-colors',
            lighting
              ? 'bg-primary/20 font-semibold text-foreground'
              : 'bg-secondary text-muted-foreground hover:text-foreground',
          )}
        >
          Освещение ночью
        </button>
        <button
          type="button"
          onClick={() => setCovered(!covered)}
          aria-pressed={covered}
          className={cn(
            'rounded-lg px-3 py-2.5 text-sm transition-colors',
            covered
              ? 'bg-primary/20 font-semibold text-foreground'
              : 'bg-secondary text-muted-foreground hover:text-foreground',
          )}
        >
          Крыша / навес
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <FieldLabel>Описание</FieldLabel>
        <textarea
          className={cn(inputClass, 'min-h-20 resize-y')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Что тут есть, как заехать, нюансы..."
          maxLength={1000}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <FieldLabel>Теги (через запятую)</FieldLabel>
        <input
          className={inputClass}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="флэт, гэп, banks"
          maxLength={200}
        />
      </label>

      <p className="font-mono text-xs text-muted-foreground">
        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? 'Сохранение...' : initial ? 'Сохранить' : 'Добавить спот'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

function Comments({ spotId, currentUserId, isStaff }: { spotId: number; currentUserId: string | null; isStaff: boolean }) {
  const { data: list = [], mutate } = useSWR(`comments-${spotId}`, () => getComments(spotId))
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await addComment(spotId, text)
      setText('')
      await mutate()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldLabel>Комментарии ({list.length})</FieldLabel>
      {currentUserId && (
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) submit()
            }}
            placeholder="Написать комментарий..."
            maxLength={500}
          />
          <Button size="sm" onClick={submit} disabled={sending || !text.trim()} className="h-auto">
            {sending ? '...' : 'ОК'}
          </Button>
        </div>
      )}
      {list.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 rounded-lg bg-secondary p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold text-primary uppercase">{c.authorName}</span>
            {(c.userId === currentUserId || isStaff) && (
              <button
                onClick={async () => {
                  await deleteComment(c.id)
                  await mutate()
                }}
                className="font-mono text-[10px] text-muted-foreground hover:text-destructive"
                aria-label="Удалить комментарий"
              >
                удалить
              </button>
            )}
          </div>
          <p className="text-sm leading-relaxed">{c.text}</p>
        </div>
      ))}
    </div>
  )
}

function SpotDetails({
  spot,
  deleting,
  isOwner,
  canReport,
  isStaff,
  onEdit,
  onDelete,
  onReport,
  onClose,
}: {
  spot: Spot
  deleting: boolean
  isOwner: boolean
  canReport: boolean
  isStaff: boolean
  onEdit: () => void
  onDelete: () => void
  onReport: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportSending, setReportSending] = useState(false)
  const [reportDone, setReportDone] = useState(false)

  async function handleReportSubmit() {
    if (!reportReason.trim()) return
    setReportSending(true)
    try {
      await onReport(reportReason)
      setReportDone(true)
      setReporting(false)
    } finally {
      setReportSending(false)
    }
  }
  const type = getSpotType(spot.spotType)
  const sec = getSecurity(spot.security)
  const tags = spot.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider"
          style={{ backgroundColor: type.color, color: '#16171d' }}
        >
          {type.label}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <FieldLabel>Сложность</FieldLabel>
          <div className="flex gap-1" aria-label={`Сложность ${spot.difficulty} из 5`}>
            {[1, 2, 3, 4, 5].map((d) => (
              <span
                key={d}
                className={cn('h-2 w-5 rounded-sm', d <= spot.difficulty ? 'bg-primary' : 'bg-muted')}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <FieldLabel>Покрытие</FieldLabel>
          <span className="text-sm">{getSurfaceLabel(spot.surface)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <FieldLabel>Охрана</FieldLabel>
          <span className="text-sm" style={{ color: sec.color }}>
            {sec.label}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <FieldLabel>Условия</FieldLabel>
          <span className="text-sm">
            {[spot.lighting && 'свет ночью', spot.covered && 'под крышей'].filter(Boolean).join(', ') || '—'}
          </span>
        </div>
      </div>

      {spot.description && <p className="text-sm leading-relaxed text-muted-foreground">{spot.description}</p>}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 font-mono text-xs text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <p className="font-mono text-xs text-muted-foreground">
        {spot.authorName ? `Добавил: ${spot.authorName}` : 'Автор неизвестен'}
      </p>

      <div className="flex gap-2">
        {isOwner ? (
          <>
            <Button onClick={onEdit} className="flex-1">
              Редактировать
            </Button>
            {confirming ? (
              <Button variant="destructive" disabled={deleting} onClick={onDelete}>
                {deleting ? '...' : 'Точно?'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Удалить
              </Button>
            )}
          </>
        ) : (
          <p className="flex flex-1 items-center font-mono text-xs text-muted-foreground">
            {'Изменять может только автор'}
          </p>
        )}
        <Button variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
      </div>

      {/* Report (жалоба) */}
      {canReport && (!isOwner || isStaff) && (
        <div className="flex flex-col gap-2">
          {reportDone ? (
            <p className="font-mono text-xs text-primary">Жалоба отправлена — модератор её рассмотрит</p>
          ) : reporting ? (
            <>
              <textarea
                className={cn(inputClass, 'min-h-16 resize-y')}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Почему этот спот нужно проверить? (фейк, дубликат, опасно...)"
                maxLength={500}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={reportSending || !reportReason.trim()}
                  onClick={handleReportSubmit}
                  className="flex-1"
                >
                  {reportSending ? 'Отправка...' : 'Отправить жалобу'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>
                  Отмена
                </Button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setReporting(true)}
              className="self-start font-mono text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline"
            >
              Пожаловаться на спот
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function SpotPanel({
  mode,
  draft,
  spot,
  saving,
  deleting,
  currentUserId,
  isAdmin,
  isStaff,
  onTypeChange,
  onSubmit,
  onEdit,
  onDelete,
  onReport,
  onClose,
}: {
  mode: 'create' | 'view' | 'edit'
  draft: DraftPoint | null
  spot: Spot | null
  saving: boolean
  deleting: boolean
  currentUserId: string | null
  isAdmin: boolean
  isStaff: boolean
  onTypeChange: (t: string) => void
  onSubmit: (input: SpotInput) => void
  onEdit: () => void
  onDelete: () => void
  onReport: (reason: string) => Promise<void>
  onClose: () => void
}) {
  // Reset internal form state when target changes by keying the form
  const formKey =
    mode === 'edit' && spot ? `edit-${spot.id}` : draft ? `create-${draft.lat}-${draft.lng}` : 'none'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = mode === 'create' ? 'Новый спот' : mode === 'edit' ? 'Редактирование' : (spot?.name ?? '')

  // Owner check: legacy spots without userId can be claimed by any signed-in user; admin can edit anything
  const isOwner = Boolean(currentUserId && spot && (!spot.userId || spot.userId === currentUserId || isAdmin))

  return (
    <aside
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1000] flex max-h-[70dvh] flex-col rounded-t-2xl bg-card/95 shadow-2xl backdrop-blur-md md:inset-x-auto md:top-20 md:right-4 md:bottom-4 md:max-h-none md:w-95 md:rounded-2xl"
      aria-label={title}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="font-display text-base font-semibold text-balance">{title}</h2>
        <button
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Закрыть панель"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="overflow-y-auto px-5 py-5">
        {mode === 'view' && spot ? (
          <div className="flex flex-col gap-6">
            <SpotDetails
              spot={spot}
              deleting={deleting}
              isOwner={isOwner}
              canReport={Boolean(currentUserId)}
              isStaff={isStaff}
              onEdit={onEdit}
              onDelete={onDelete}
              onReport={onReport}
              onClose={onClose}
            />
            <Comments spotId={spot.id} currentUserId={currentUserId} isStaff={isStaff} />
          </div>
        ) : mode === 'edit' && spot ? (
          <SpotForm
            key={formKey}
            point={{ lat: spot.lat, lng: spot.lng }}
            initial={spot}
            saving={saving}
            onTypeChange={onTypeChange}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        ) : draft ? (
          <SpotForm
            key={formKey}
            point={draft}
            saving={saving}
            onTypeChange={onTypeChange}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        ) : null}
      </div>
    </aside>
  )
}
