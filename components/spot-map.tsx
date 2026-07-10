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
  if (zoom >= 17) {
    const clusters: SpotCluster[] = []
    const visited = new Set<number>()

    for (let i = 0; i < spots.length; i++) {
      if (visited.has(spots[i].id)) continue
      const currentSpot = spots[i]
      const group = [currentSpot]
      visited.add(currentSpot.id)

      for (let j = i + 1; j < spots.length; j++) {
        if (visited.has(spots[j].id)) continue
        const otherSpot = spots[j]
        const latDiff = Math.abs(currentSpot.lat - otherSpot.lat)
        const lngDiff = Math.abs(currentSpot.lng - otherSpot.lng)
        if (latDiff < 0.00015 && lngDiff < 0.00015) {
          group.push(otherSpot)
          visited.add(otherSpot.id)
        }
      }

      clusters.push({
        lat: group.reduce((a, s) => a + s.lat, 0) / group.length,
        lng: group.reduce((a, s) => a + s.lng, 0) / group.length,
        spots: group,
      })
    }
    return clusters
  }

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
  const lastTargetRef = useRef<string>('')

  useEffect(() => {
    if (!target) return
    const key = `${target.lat},${target.lng}`
    
    const center = map.getCenter()
    const isCentered = Math.abs(center.lat - target.lat) < 0.0001 && Math.abs(center.lng - target.lng) < 0.0001
    const isZoomed = map.getZoom() >= 16

    if (isCentered && isZoomed && key === lastTargetRef.current) return

    lastTargetRef.current = key
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 })
  }, [target, map])

  return null
}

function SpotMarkers({
  clusters,
  draft,
  draftIcon,
  onSpotClick,
  onClusterClick,
}: {
  clusters: SpotCluster[]
  draft: DraftPoint | null
  draftIcon: L.DivIcon
  onSpotClick: (spot: Spot) => void
  onClusterClick: (cluster: SpotCluster) => void
}) {
  const map = useMap()

  return (
    <>
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
                const currentZoom = map.getZoom()
                if (currentZoom < 17) {
                  map.setView([c.lat, c.lng], Math.min(currentZoom + 2, 17))
                } else {
                  onClusterClick(c)
                }
              },
            }}
          />
        ),
      )}
      {draft && <Marker position={[draft.lat, draft.lng]} icon={draftIcon} />}
    </>
  )
}

export default function SpotMap({
  spots,
  draft,
  draftType,
  flyTarget,
  mapStyle,
  userLocation,
  onMapClick,
  onSpotClick,
  onClusterClick,
}: {
  spots: Spot[]
  draft: DraftPoint | null
  draftType: string
  flyTarget: DraftPoint | null
  mapStyle: string
  userLocation: { lat: number; lng: number } | null
  onMapClick: (p: DraftPoint) => void
  onSpotClick: (spot: Spot) => void
  onClusterClick: (cluster: SpotCluster) => void
}) {
  const draftIcon = useMemo(() => makeSpotIcon(draftType, true), [draftType])
  const userLocationIcon = useMemo(() => {
    return L.divIcon({
      className: 'user-location-marker',
      html: '<div class="user-dot"><span class="user-pulse"></span></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })
  }, [])

  const style = getMapStyle(mapStyle)
  const [zoom, setZoom] = useState(3)
  const clusters = useMemo(() => clusterSpots(spots, zoom), [spots, zoom])

  return (
    <MapContainer
      center={[20, 0]}
      zoom={3}
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
      {style.value === 'satellite' && (
        <TileLayer
          key="satellite-labels"
          attribution="&copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
          noWrap={true}
          bounds={[
            [-85, -180],
            [85, 180],
          ]}
        />
      )}
      <ClickHandler onMapClick={onMapClick} />
      <FlyTo target={flyTarget} />
      <ZoomTracker onZoom={setZoom} />
      <SpotMarkers
        clusters={clusters}
        draft={draft}
        draftIcon={draftIcon}
        onSpotClick={onSpotClick}
        onClusterClick={onClusterClick}
      />
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon} />
      )}
    </MapContainer>
  )
}
