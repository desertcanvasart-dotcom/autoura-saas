'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, User, Route, Receipt, Wallet, Star } from 'lucide-react'
import type { CopilotContext } from '@/app/types/copilot'

const SYM: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
const money = (n: number | null, c: string | null) =>
  n == null ? '—' : `${SYM[c || ''] || (c ? c + ' ' : '')}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

export default function CopilotContextCard({ context }: { context: CopilotContext }) {
  const [open, setOpen] = useState(true)
  const { client, itineraries, invoices, payments } = context

  if (!client && itineraries.length === 0 && invoices.length === 0 && payments.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-3 text-xs text-gray-400 bg-gray-50">
        No linked client context for this thread.
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <User className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="text-sm font-medium text-gray-800 truncate">{client?.name || 'Client context'}</span>
          {client?.vip && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 text-xs">
          {client && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
              {client.email && <span>{client.email}</span>}
              {client.phone && <span>{client.phone}</span>}
              {client.nationality && <span>{client.nationality}</span>}
              {client.language && <span>{client.language}</span>}
            </div>
          )}

          {itineraries.length > 0 && (
            <Section icon={<Route className="h-3.5 w-3.5" />} title="Recent trips">
              {itineraries.map((i, idx) => (
                <Row key={idx}
                  left={`${i.reference || ''} ${i.trip_name || ''}`.trim() || 'Itinerary'}
                  mid={[i.start_date, i.end_date].filter(Boolean).join(' → ')}
                  right={i.status || ''}
                  amount={money(i.total, i.currency)} />
              ))}
            </Section>
          )}

          {invoices.length > 0 && (
            <Section icon={<Receipt className="h-3.5 w-3.5" />} title="Invoices">
              {invoices.map((v, idx) => (
                <Row key={idx} left={v.number || 'Invoice'} mid={v.due_date ? `due ${v.due_date}` : ''} right={v.status || ''} amount={money(v.total, null)} />
              ))}
            </Section>
          )}

          {payments.length > 0 && (
            <Section icon={<Wallet className="h-3.5 w-3.5" />} title="Payments">
              {payments.map((p, idx) => (
                <Row key={idx} left={money(p.amount, p.currency)} mid={p.date ? String(p.date).slice(0, 10) : ''} right={p.status || ''} amount="" />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-gray-400 uppercase tracking-wide text-[10px] font-semibold mb-1">
        {icon}{title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ left, mid, right, amount }: { left: string; mid: string; right: string; amount: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-600">
      <span className="flex-1 truncate text-gray-800">{left}</span>
      {mid && <span className="text-gray-400 truncate hidden sm:inline">{mid}</span>}
      {right && <span className="text-gray-400">{right}</span>}
      {amount && <span className="font-medium text-gray-800 tabular-nums">{amount}</span>}
    </div>
  )
}
