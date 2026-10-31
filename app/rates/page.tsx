'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { RATE_GROUPS, rateCategoryHref } from '@/lib/nav/config'
import { useRatesSummary } from '@/components/rates/RatesMenu'

// The Rates Overview: what is on file, what runs out soon, what the Rates
// check flags, and each rate sheet with its count and when it last changed.
// Importing and adding happen on a sheet (each has its own columns), so the
// two actions here ask which one.

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function CategoryChooser({ label, primary }: { label: string; primary?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-medium ${
          primary ? 'bg-primary-700 text-white hover:bg-primary-800' : 'bg-white border border-gray-200 text-gray-800 hover:bg-gray-50'
        }`}
      >
        {label} <ChevronDown size={16} strokeWidth={1.7} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-30">
          <p className="px-4 pb-1 text-xs text-gray-500">Which rate sheet?</p>
          {RATE_GROUPS.map(g => (
            <div key={g.key} className="pt-1">
              <p className="px-4 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{g.title}</p>
              {g.categories.map(c => (
                <Link key={c.slug} role="menuitem" href={rateCategoryHref(c.slug)} className="block px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  {c.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RatesOverviewPage() {
  const { summary, error } = useRatesSummary()
  const cats = summary ? Object.values(summary.categories) : []
  const total = summary ? cats.reduce((n, c) => n + c.count, 0) : null
  const expiring = summary ? cats.reduce((n, c) => n + c.expiring, 0) : null
  const show = (n: number | null | undefined) => (n === null || n === undefined ? '…' : n.toLocaleString())

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Rates</h1>
          <p className="mt-1 text-sm text-gray-600">All supplier rates in one place. Pick a rate sheet from the menu.</p>
        </div>
        <div className="flex gap-2">
          <CategoryChooser label="Import sheet" />
          <CategoryChooser label="Add rate" primary />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Rates on file</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{show(total)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Expiring in 30 days</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${expiring ? 'text-amber-700' : 'text-gray-900'}`}>{show(expiring)}</p>
        </div>
        <Link href="/rates/check" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300">
          <p className="text-sm text-gray-500">Flagged by Rates check</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{show(summary?.flagged)}</p>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {RATE_GROUPS.map(g => (
          <section key={g.key} className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-900">{g.title}</h2>
            <ul className="mt-3 divide-y divide-gray-100">
              {g.categories.map(c => {
                const s = summary?.categories[c.slug]
                return (
                  <li key={c.slug}>
                    <Link href={rateCategoryHref(c.slug)} className="flex items-baseline justify-between gap-3 py-2.5 hover:text-primary-800">
                      <span className="text-[15px] text-gray-900">{c.label}</span>
                      <span className="text-xs text-gray-500 text-right">
                        {!s ? '…' : s.count === 0 ? 'No rates yet' : `${s.count.toLocaleString()} ${s.count === 1 ? 'rate' : 'rates'} · updated ${formatDate(s.updatedAt)}`}
                        {s && s.expiring > 0 && <span className="block text-amber-700">{s.expiring} expiring soon</span>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
