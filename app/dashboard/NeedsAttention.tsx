'use client'

// ============================================
// Needs attention (C4)
// ============================================
// The dashboard promises "here's what needs you today" and, until now,
// answered with totals. This is the answer: the exceptions an operator must
// act on before a group flies, each linking to the screen that fixes it.
//
// Loads on its own so a slow or failing scan degrades to a quiet panel rather
// than holding up the numbers above it.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Wallet, IdCard, UserRound, MessageSquare } from 'lucide-react'

interface AttentionItem {
  type: 'balance_due' | 'details_missing' | 'no_guide' | 'change_request'
  severity: 'urgent' | 'soon'
  bookingId: string
  bookingNumber: string | null
  tripName: string | null
  clientName: string | null
  startDate: string | null
  detail: Record<string, unknown>
  href: string
}

const ICONS = {
  balance_due: Wallet,
  details_missing: IdCard,
  no_guide: UserRound,
  change_request: MessageSquare,
} as const

function describe(item: AttentionItem): string {
  const d = item.detail
  switch (item.type) {
    case 'balance_due':
      return d.overdue
        ? `Balance overdue${d.deadline ? ` since ${d.deadline}` : ''}`
        : `Balance due${d.deadline ? ` by ${d.deadline}` : ' before departure'}`
    case 'details_missing':
      return `Traveller details: ${d.complete} of ${d.total} complete`
    case 'no_guide':
      return 'No guide assigned'
    case 'change_request':
      return d.requestedCount
        ? `Asked to add ${d.requestedCount} traveller${d.requestedCount === 1 ? '' : 's'}`
        : 'Change request waiting'
  }
}

export default function NeedsAttention() {
  const [items, setItems] = useState<AttentionItem[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/attention')
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.success) {
        setItems(json.data.items)
        setState('ready')
      } else {
        setState('failed')
      }
    } catch {
      setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const urgent = items.filter(i => i.severity === 'urgent').length

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Needs attention
          {urgent > 0 && (
            <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
              {urgent} urgent
            </span>
          )}
        </h2>
        <span className="text-xs text-gray-400">Next 45 days</span>
      </div>

      {state === 'loading' ? (
        <div className="space-y-2">
          {[0, 1].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : state === 'failed' ? (
        <p className="text-xs text-gray-500">
          This check couldn’t run just now. Everything else on the dashboard is unaffected.
        </p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 py-3">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <p className="text-sm text-gray-600">Nothing outstanding on upcoming departures.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((item, i) => {
            const Icon = ICONS[item.type]
            return (
              <li key={`${item.bookingId}-${item.type}-${i}`}>
                <Link href={item.href} className="flex items-start gap-3 py-2.5 px-1 hover:bg-gray-50 rounded transition-colors">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${item.severity === 'urgent' ? 'text-red-600' : 'text-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">
                      {item.tripName || item.bookingNumber || 'Booking'}
                      {item.clientName && <span className="text-gray-500"> · {item.clientName}</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {describe(item)}
                      {item.startDate && ` · departs ${item.startDate}`}
                    </p>
                  </div>
                  {item.severity === 'urgent' && (
                    <span className="text-[10px] uppercase tracking-wide text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 shrink-0">
                      urgent
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
