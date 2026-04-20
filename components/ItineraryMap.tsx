'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Map as MapIcon, ChevronDown, ChevronUp, Ship, Route } from 'lucide-react'
import {
  resolveCityCoordinates,
  NILE_CRUISE_CITIES,
  type CityCoordinate,
} from '@/lib/constants/egypt-city-coordinates'

// Dynamically import Leaflet components (SSR-incompatible)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })

export interface ItineraryMapDay {
  day_number: number
  title?: string
  city?: string
  overnight_city?: string | null
  date?: string
  is_cruise_day?: boolean
}

interface ResolvedStop {
  dayNumber: number
  title: string
  city: string
  overnightCity: string
  coords: CityCoordinate
  isCruise: boolean
  date?: string
}

interface ItineraryMapProps {
  days: ItineraryMapDay[]
  defaultExpanded?: boolean
  height?: number
}

const LAND_COLOR = '#647C47'
const CRUISE_COLOR = '#3B82F6'

function isCruiseCity(cityName: string): boolean {
  return NILE_CRUISE_CITIES.some(c => c.toLowerCase() === cityName.toLowerCase())
}

function offsetCoords(stops: ResolvedStop[]) {
  const seen = new Map<string, number>()
  return stops.map(stop => {
    const key = `${stop.coords.lat},${stop.coords.lng}`
    const count = seen.get(key) || 0
    seen.set(key, count + 1)
    const angle = (count * 137.508 * Math.PI) / 180
    const radius = count * 0.012
    return { ...stop, displayLat: stop.coords.lat + radius * Math.cos(angle), displayLng: stop.coords.lng + radius * Math.sin(angle) }
  })
}

export default function ItineraryMap({ days, defaultExpanded = false, height = 420 }: ItineraryMapProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [leafletLoaded, setLeafletLoaded] = useState(false)

  const stops = useMemo<ResolvedStop[]>(() => {
    const result: ResolvedStop[] = []
    for (const day of days) {
      const cityName = day.city || day.overnight_city || ''
      if (!cityName) continue
      const coords = resolveCityCoordinates(cityName)
      if (!coords) continue
      const overnightName = day.overnight_city || cityName
      const isCruise = day.is_cruise_day === true || (isCruiseCity(cityName) && isCruiseCity(overnightName))
      result.push({ dayNumber: day.day_number, title: day.title || `Day ${day.day_number}`, city: cityName, overnightCity: overnightName, coords, isCruise, date: day.date })
    }
    return result
  }, [days])

  const segments = useMemo(() => {
    const segs: { points: [number, number][]; isCruise: boolean }[] = []
    if (stops.length < 2) return segs
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i], to = stops[i + 1]
      const segIsCruise = from.isCruise && to.isCruise
      const points: [number, number][] = [[from.coords.lat, from.coords.lng], [to.coords.lat, to.coords.lng]]
      if (segs.length > 0 && segs[segs.length - 1].isCruise === segIsCruise) {
        segs[segs.length - 1].points.push(points[1])
      } else {
        segs.push({ points, isCruise: segIsCruise })
      }
    }
    return segs
  }, [stops])

  const offsetStops = useMemo(() => offsetCoords(stops), [stops])
  const hasCruise = stops.some(s => s.isCruise)

  if (stops.length === 0) return null

  // Load Leaflet CSS dynamically
  if (expanded && typeof window !== 'undefined' && !leafletLoaded) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    setLeafletLoaded(true)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#E8EDE0] flex items-center justify-center">
            <MapIcon className="w-4 h-4 text-[#647C47]" />
          </div>
          <span className="text-sm font-semibold text-gray-900">Route Map</span>
          <span className="text-xs text-gray-500">{stops.length} stop{stops.length !== 1 ? 's' : ''}</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div>
          <div style={{ height }} className="relative">
            <MapContainer
              center={[stops[0].coords.lat, stops[0].coords.lng]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {segments.map((seg, idx) => (
                <Polyline key={idx} positions={seg.points}
                  pathOptions={{ color: seg.isCruise ? CRUISE_COLOR : LAND_COLOR, weight: 3, opacity: 0.7, dashArray: seg.isCruise ? '8 6' : undefined }} />
              ))}
              {offsetStops.map(stop => (
                <Marker key={stop.dayNumber} position={[stop.displayLat, stop.displayLng]}>
                  <Popup>
                    <div className="min-w-[160px]">
                      <div className="font-semibold text-gray-900 mb-1">Day {stop.dayNumber}: {stop.title}</div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <div><span className="font-medium text-gray-700">City:</span> {stop.city}</div>
                        {stop.overnightCity !== stop.city && <div><span className="font-medium text-gray-700">Overnight:</span> {stop.overnightCity}</div>}
                        {stop.date && <div><span className="font-medium text-gray-700">Date:</span> {new Date(stop.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
                        {stop.isCruise && <div className="flex items-center gap-1 text-blue-600 mt-1"><Ship className="w-3 h-3" /> Nile Cruise</div>}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: LAND_COLOR }} />
              <Route className="w-3 h-3" style={{ color: LAND_COLOR }} />
              <span>Land route</span>
            </div>
            {hasCruise && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: CRUISE_COLOR }} />
                <Ship className="w-3 h-3" style={{ color: CRUISE_COLOR }} />
                <span>Nile Cruise</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
