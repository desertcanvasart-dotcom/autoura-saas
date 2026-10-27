// The tour's route on a map of Egypt, drawn from its days' cities in order.
// A plain SVG: no map service, no key, no script — and nothing drawn that the
// records do not say (a city we have no position for is simply left out).

import type { TourFacts } from '@/lib/publish/contract'

/** [longitude, latitude] of the places tours stay or visit. */
const PLACES: Record<string, [number, number]> = {
  cairo: [31.24, 30.04], giza: [31.13, 29.98], alexandria: [29.92, 31.2], saqqara: [31.22, 29.87], dahshur: [31.21, 29.79],
  memphis: [31.25, 29.85], fayoum: [30.84, 29.31], luxor: [32.64, 25.69], aswan: [32.9, 24.09], edfu: [32.87, 24.98],
  'kom ombo': [32.93, 24.45], 'abu simbel': [31.63, 22.34], hurghada: [33.81, 27.26], 'marsa alam': [34.89, 25.07],
  'sharm el sheikh': [34.33, 27.91], dahab: [34.52, 28.5], 'st catherine': [33.97, 28.56], siwa: [25.52, 29.2],
  bahariya: [28.86, 28.35], farafra: [27.97, 27.06], 'white desert': [28.0, 27.3], 'port said': [32.3, 31.26],
}

// A simplified outline of Egypt (with Sinai) and the course of the Nile.
const OUTLINE: Array<[number, number]> = [
  [25, 31.6], [27.3, 31.35], [29.1, 30.85], [30.1, 31.45], [31.4, 31.55], [32.3, 31.3], [34.2, 31.3], [34.9, 29.5],
  [34.25, 27.75], [33.1, 28.9], [32.55, 29.95], [32.75, 29.2], [33.1, 28.35], [33.8, 27.25], [34.6, 25.9], [35.5, 23.95],
  [36.9, 22], [25, 22],
]
const NILE: Array<[number, number]> = [
  [31.63, 22.34], [32.9, 24.09], [32.93, 24.45], [32.87, 24.98], [32.64, 25.69], [32.72, 26.16], [31.7, 26.56],
  [30.75, 28.1], [31.24, 30.04], [30.9, 30.7], [29.92, 31.2],
]

const W = 520, H = 400
const xy = ([lon, lat]: [number, number]) => [((lon - 24.5) / 13) * W, ((32 - lat) / 10) * H] as const
const path = (pts: Array<[number, number]>) => pts.map((p, i) => `${i ? 'L' : 'M'}${xy(p).map(n => n.toFixed(1)).join(' ')}`).join(' ')

function placeOf(name: string | null): [number, number] | null {
  const n = (name ?? '').toLowerCase()
  const key = Object.keys(PLACES).find(k => n.includes(k))
  return key ? PLACES[key] : null
}

/** The cities a tour moves through, in day order, each stop once in a row. */
export function routeStops(facts: TourFacts): Array<{ name: string; at: [number, number] }> {
  const stops: Array<{ name: string; at: [number, number] }> = []
  for (const d of facts.days) {
    const at = placeOf(d.city)
    if (at && d.city && stops.at(-1)?.name !== d.city) stops.push({ name: d.city, at })
  }
  return stops
}

export function RouteMap({ facts, label, className }: { facts: TourFacts; label: string; className?: string }) {
  const stops = routeStops(facts)
  if (stops.length === 0) return null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`${label}: ${stops.map(s => s.name).join(' → ')}`}>
      <path d={`${path(OUTLINE)} Z`} fill="var(--map-land)" stroke="var(--map-edge)" strokeWidth="1.5" />
      <path d={path(NILE)} fill="none" stroke="var(--map-river)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {stops.length > 1 && (
        <path d={path(stops.map(s => s.at))} fill="none" stroke="var(--brand-accent)" strokeWidth="3.5" strokeDasharray="2 9" strokeLinecap="round" />
      )}
      {stops.map((s, i) => {
        const [x, y] = xy(s.at)
        return (
          <g key={`${s.name}-${i}`}>
            <circle cx={x} cy={y} r="9" fill="var(--brand-primary)" stroke="#fff" strokeWidth="3" />
            <text x={x + 14} y={y + 5} fontSize="15" fontWeight="600" fill="var(--brand-ink)" paintOrder="stroke" stroke="#fff" strokeWidth="4">{s.name}</text>
          </g>
        )
      })}
    </svg>
  )
}
