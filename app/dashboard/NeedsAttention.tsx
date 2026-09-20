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

import { useCallback, useEffect, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Wallet, IdCard, UserRound, MessageSquare, PackagePlus, MailWarning } from 'lucide-react'
// The item and its kinds are the API's own. This panel used to keep a copy of
// the list, typed out by hand — and the copy stopped at four while the API
// went on to six ('extra_request' in #300, 'awaiting_reply' in #449). An item
// of a kind with no icon here rendered `undefined` as a component, which is
// React error #130, and took the WHOLE DASHBOARD down with it: reported from
// production on 2026-09-20, the first account with a customer waiting more
// than a day for a reply.
import type { AttentionItem, AttentionType } from '@/lib/dashboard/attention'

type IconType = ComponentType<{ className?: string }>

// Record<AttentionType, …>, not `as const`: a kind added to the API without an
// icon is now a type error, not a crashed page.
const ICONS: Record<AttentionType, IconType> = {
  balance_due: Wallet,
  details_missing: IdCard,
  no_guide: UserRound,
  change_request: MessageSquare,
  extra_request: PackagePlus,
  awaiting_reply: MailWarning,
}

/** The icon for an item. The fallback is for the one case the types cannot
 *  cover: a browser tab still running yesterday's code against today's API.
 *  A list of reminders must never be able to take the page down. */
export function iconFor(type: string): IconType {
  return (ICONS as Record<string, IconType | undefined>)[type] ?? AlertTriangle
}

function waitedFor(hours: unknown): string {
  const h = Number(hours)
  if (!Number.isFinite(h) || h < 24) return 'more than a day'
  const days = Math.floor(h / 24)
  return days === 1 ? '1 day' : `${days} days`
}

/** What the first line says. A conversation is not a booking. */
export function headline(item: AttentionItem): string {
  if (item.type === 'awaiting_reply') return item.clientName || 'A customer'
  return item.tripName || item.bookingNumber || 'Booking'
}

export function describe(item: AttentionItem): string {
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
    case 'extra_request':
      return d.title ? `Extra requested: ${d.title}` : 'An extra was requested and is waiting on the office'
    case 'awaiting_reply':
      return `Waiting ${waitedFor(d.hours)} for our reply`
    default:
      // Reached only by a kind this build has never heard of — see iconFor.
      return 'Needs a look'
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
            const Icon = iconFor(item.type)
            return (
              <li key={`${item.bookingId}-${item.type}-${i}`}>
                <Link href={item.href} className="flex items-start gap-3 py-2.5 px-1 hover:bg-gray-50 rounded transition-colors">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${item.severity === 'urgent' ? 'text-red-600' : 'text-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">
                      {headline(item)}
                      {item.clientName && item.type !== 'awaiting_reply' && <span className="text-gray-500"> · {item.clientName}</span>}
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
