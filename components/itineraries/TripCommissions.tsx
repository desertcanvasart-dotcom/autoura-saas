'use client'

// The trip's commissions, in its Finance tab: what it earns (hotel,
// shopping, …) and what it owes (agents, partners), each with its status,
// and the net — the same rows the P&L counts (lib/trip-pnl.ts). Generate
// commissions (from the services) runs from here as well as from the ⋯ menu.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Handshake, Loader2 } from 'lucide-react'
import { formatMoney } from '@/lib/currency-totals'

interface Commission {
  id: string
  description: string | null
  source_name: string | null
  category: string | null
  commission_type: string | null
  commission_amount: number | string | null
  currency: string | null
  status: string | null
}

const STATUS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  invoiced: 'bg-blue-50 text-blue-700',
  approved: 'bg-blue-50 text-blue-700',
  received: 'bg-green-50 text-green-700',
  paid: 'bg-green-50 text-green-700',
  disputed: 'bg-amber-50 text-amber-800',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
}

const label = (s: string | null) => (s ? s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '')

export default function TripCommissions({ itineraryId, currency, refreshSignal = 0, onGenerate, generating }: {
  itineraryId: string
  currency: string
  /** Bump to reload (after Generate commissions). */
  refreshSignal?: number
  onGenerate: () => void
  generating?: boolean
}) {
  const [rows, setRows] = useState<Commission[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/commissions?itineraryId=${encodeURIComponent(itineraryId)}`)
      .then(r => r.json())
      .then(json => {
        if (json?.success && Array.isArray(json.data)) { setRows(json.data); setFailed(false) }
        else setFailed(true)
      })
      .catch(() => setFailed(true))
  }, [itineraryId])

  useEffect(() => { load() }, [load, refreshSignal])

  const live = (rows ?? []).filter(r => (r.status ?? '').toLowerCase() !== 'cancelled')
  const sum = (type: string) => live
    .filter(r => (r.commission_type ?? '').toLowerCase() === type && (r.currency ?? currency) === currency)
    .reduce((n, r) => n + (Number(r.commission_amount) || 0), 0)
  const earned = sum('receivable')
  const owed = sum('payable')
  const otherCurrency = live.some(r => (r.currency ?? currency) !== currency)
  const money = (n: number, c = currency) => formatMoney(n, c)

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Handshake className="w-4 h-4 text-gray-500" /> Commissions</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          {live.length > 0 && (
            <>
              <span>Earned <span className="font-semibold text-green-700">{money(earned)}</span></span>
              <span>Owed <span className="font-semibold text-gray-900">{money(owed)}</span></span>
              <span>Net <span className="font-semibold text-gray-900">{earned - owed >= 0 ? '+' : ''}{money(earned - owed)}</span></span>
            </>
          )}
          <button type="button" onClick={onGenerate} disabled={generating} className="text-primary-600 hover:underline disabled:opacity-50 flex items-center gap-1" title="Create the commission records from this trip's services">
            {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Generate from services
          </button>
        </div>
      </div>
      <div className="p-4">
        {rows === null && !failed && <p className="text-xs text-gray-400">Loading…</p>}
        {failed && <p className="text-xs text-gray-500">Could not load the commissions.</p>}
        {rows && rows.length === 0 && <p className="text-sm text-gray-500">No commissions on this trip yet.</p>}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {rows.map(r => {
              const payable = (r.commission_type ?? '').toLowerCase() === 'payable'
              const status = (r.status ?? 'pending').toLowerCase()
              return (
                <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-gray-900 truncate">{r.source_name || r.description || label(r.category) || 'Commission'}</p>
                    <p className="text-xs text-gray-500">
                      {payable ? 'Owed' : 'Earned'}{r.category && <> · {label(r.category)}</>}
                      {r.description && r.source_name && <> · {r.description}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS[status] ?? 'bg-gray-100 text-gray-700'}`}>{label(status)}</span>
                    <span className={`font-medium whitespace-nowrap ${payable ? 'text-gray-900' : 'text-green-700'}`}>
                      {payable ? '−' : '+'}{money(Number(r.commission_amount) || 0, r.currency ?? currency)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {otherCurrency && <p className="mt-2 text-xs text-gray-500">Commissions in another currency are listed but not in the totals; the P&amp;L converts them.</p>}
        <Link href="/commissions" className="mt-3 inline-block text-xs text-primary-600 hover:underline">All commissions</Link>
      </div>
    </div>
  )
}
