'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Spot } from '@/lib/db/schema'
import { getMapStyle, getSpotType } from '@/lib/spot-config'

type DraftPoint = { lat: number; lng: number }

export type SpotCluster = { lat: number; lng: number; spots: Spot[] }

function makeClusterIcon(count: number) {
  return L.divIcon({
    className: 'spot-marker',
    html: `<div class="spot-pin spot-pin-cluster"><span class="spot-pin-inner">${count}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  })
}

// Grid-based clustering: cell size shrinks as zoom grows
function clusterSpots(spots: Spot[], zoom: number): SpotCluster[] {
  if (zoom >= 17) return spots.map((s) => ({ lat: s.lat, lng: s.lng, spots: [s] }))
  const cell = 160 / Math.pow(2, zoom) // degrees per cluster cell
  const buckets = new Map<string, Spot[]>()
  for (const s of spots) {
    const key = `${Math.round(s.lat / cell)}:${Math.round(s.lng / cell)}`
    const arr = buckets.get(key)
    if (arr) arr.push(s)
    else buckets.set(key, [s])
  }
  return [...buckets.values()].map((group) => ({
    lat: group.reduce((a, s) => a + s.lat, 0) / group.length,
    lng: group.reduce((a, s) => a + s.lng, 0) / group.length,
    spots: group,
  }))
}

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend() {
      onZoom(map.getZoom())
    },
  })
  return null
}

function makeSpotIcon(spotType: string, draft = false) {
  const type = getSpotType(spotType)
  const color = draft ? '#c8f542' : type.color
  const short = draft ? '+' : type.short
  return L.divIcon({
    className: 'spot-marker',
    html: `<div class="spot-pin ${draft ? 'spot-pin-draft' : ''}" style="background:${color}"><span class="spot-pin-inner">${short}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  })
}

function ClickHandler({ onMapClick }: { onMapClick: (p: DraftPoint) => void }) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

function FlyTo({ target }: { target: DraftPoint | null }) {
  const map = useMap()
  const lastRef = useRef<string>('')
  useEffect(() => {
    if (!target) return
    const key = `${target.lat},${target.lng}`
    if (key === lastRef.current) return
    lastRef.current = key
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 })
  }, [target, map])
  return null
}

export default function SpotMap({
  spots,
  draft,
  draftType,
  flyTarget,
  mapStyle,
  onMapClick,
  onSpotClick,
  onClusterClick,
}: {
  spots: Spot[]
  draft: DraftPoint | null
  draftType: string
  flyTarget: DraftPoint | null
  mapStyle: string
  onMapClick: (p: DraftPoint) => void
  onSpotClick: (spot: Spot) => void
  onClusterClick: (cluster: SpotCluster) => void
}) {
  const draftIcon = useMemo(() => makeSpotIcon(draftType, true), [draftType])
  const style = getMapStyle(mapStyle)
  const [zoom, setZoom] = useState(12)
  const clusters = useMemo(() => clusterSpots(spots, zoom), [spots, zoom])

  return (
    <MapContainer
      center={[55.751, 37.618]}
      zoom={12}
      minZoom={3}
      maxBounds={[
        [-85, -180],
        [85, 180],
      ]}
      maxBoundsViscosity={1}
      worldCopyJump={false}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={true}
    >
      <TileLayer
        key={style.value}
        attribution={style.attribution}
        url={style.url}
        {...(style.subdomains ? { subdomains: style.subdomains } : {})}
        maxZoom={19}
        noWrap={true}
        bounds={[
          [-85, -180],
          [85, 180],
        ]}
      />
      <ClickHandler onMapClick={onMapClick} />
      <FlyTo target={flyTarget} />
      <ZoomTracker onZoom={setZoom} />
      {clusters.map((c) =>
        c.spots.length === 1 ? (
          <Marker
            key={`s-${c.spots[0].id}`}
            position={[c.spots[0].lat, c.spots[0].lng]}
            icon={makeSpotIcon(c.spots[0].spotType)}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e as unknown as Event)
                onSpotClick(c.spots[0])
              },
            }}
          />
        ) : (
          <Marker
            key={`c-${c.lat}-${c.lng}-${c.spots.length}`}
            position={[c.lat, c.lng]}
            icon={makeClusterIcon(c.spots.length)}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e as unknown as Event)
                onClusterClick(c)
              },
            }}
          />
        ),
      )}
      {draft && <Marker position={[draft.lat, draft.lng]} icon={draftIcon} />}
    </MapContainer>
  )
}
