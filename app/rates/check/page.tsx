'use client'

// ============================================
// Rates check — rates likely saved under the wrong category
// ============================================
// The pricing grid and the itinerary parser trust a rate's tier and type, so
// a 5★ hotel saved as Standard never shows on a luxury trip, and an airport
// route saved as Full Day is priced as a day's hire. This lists the likely
// ones; each links to its rates page, filtered to it, to fix there.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Hotel, Truck } from 'lucide-react'
import type { RateFinding } from '@/lib/rates/rate-checks'

interface CheckData { hotels: RateFinding[]; transport: RateFinding[] }

function Section({ title, icon, empty, items, href, fix }: {
  title: string
  icon: React.ReactNode
  empty: string
  items: RateFinding[]
  href: string
  fix: string
}) {
  return (
    <section className="bg-white rounded-lg border border-gray-200">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        {icon}
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${items.length ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
          {items.length}
        </span>
      </header>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-gray-600">
          <CheckCircle2 className="w-4 h-4 text-green-600" /> {empty}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(f => (
            <li key={f.ids[0]} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{f.name}</p>
                <p className="text-xs text-gray-500">{[f.city, f.reason].filter(Boolean).join(' · ')}</p>
              </div>
              <p className="text-xs text-gray-700">
                <span className="capitalize">{f.current}</span> → <span className="capitalize font-medium">{f.expected}</span>?
              </p>
              <Link href={`${href}?q=${encodeURIComponent(f.name)}`} className="text-xs font-medium text-primary-700 hover:underline">
                {fix}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function RatesCheckPage() {
  const [data, setData] = useState<CheckData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/rates/check')
      .then(r => r.json())
      .then(j => (j.success ? setData(j.data) : setError(j.error || 'Could not check rates')))
      .catch(() => setError('Could not check rates'))
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Rates check</h1>
        <p className="text-sm text-gray-600 mt-1">
          Rates that look saved under the wrong category. The pricing grid and the itinerary parser go by a
          hotel&apos;s tier and a transport rate&apos;s type, so these give the wrong hotel or the wrong transport
          until they are fixed. Nothing here is changed for you.
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4" /> {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-gray-500">Checking rates…</p>}

      {data && (
        <>
          <Section
            title="Hotels whose tier doesn't fit their stars"
            icon={<Hotel className="w-4 h-4 text-gray-500" />}
            empty="Every hotel with a star rating sits in a tier that fits it."
            items={data.hotels}
            href="/rates/hotels"
            fix="Fix in Hotels"
          />
          <Section
            title="Transport whose type contradicts its route"
            icon={<Truck className="w-4 h-4 text-gray-500" />}
            empty="No airport route or Full/Half day route is saved under another type."
            items={data.transport}
            href="/rates/transportation"
            fix="Fix in Transportation"
          />
          <p className="text-xs text-gray-500">
            Hotels without a star rating can&apos;t be checked: new hotels default to Standard, so give each its stars
            and the right tier in Rates → Hotels.
          </p>
        </>
      )}
    </div>
  )
}
