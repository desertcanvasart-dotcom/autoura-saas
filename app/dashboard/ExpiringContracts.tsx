'use client'

// ============================================
// Supplier contracts running out
// ============================================
// The renewal reminder: every agreement on file (Suppliers → Documents) whose
// validity ends within the next 60 days, or lapsed in the last 30 — each
// linking straight to that supplier's Documents tab. Loads on its own so a
// slow or failing scan degrades to a quiet panel.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FileSignature, CheckCircle2 } from 'lucide-react'
import {
  CONTRACT_DOCUMENT_TYPE_LABELS,
  describeExpiry,
  type ContractDocumentType,
  type ContractStatus,
} from '@/lib/supplier-contracts'

interface Item {
  id: string
  title: string
  documentType: string
  validTo: string
  daysLeft: number
  status: ContractStatus
  supplier: { id: string; name: string; type: string } | null
  property: { id: string; name: string } | null
  href: string
}

function fmtDate(d: string) {
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ExpiringContracts() {
  const [items, setItems] = useState<Item[]>([])
  const [today, setToday] = useState('')
  const [horizon, setHorizon] = useState(60)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/expiring-contracts')
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.success) {
        setItems(json.data.items)
        setToday(json.data.today)
        setHorizon(json.data.horizonDays)
        setState('ready')
      } else {
        setState('failed')
      }
    } catch {
      setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const expired = items.filter(i => i.status === 'expired').length
  const expiring = items.length - expired

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-amber-500" />
          Supplier contracts
          {expired > 0 && (
            <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
              {expired} expired
            </span>
          )}
          {expiring > 0 && (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              {expiring} expiring
            </span>
          )}
        </h2>
        <span className="text-xs text-gray-400">Next {horizon} days</span>
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
          <p className="text-sm text-gray-600">
            No supplier contracts run out in the next {horizon} days.{' '}
            <Link href="/suppliers" className="text-primary-600 hover:underline">Add validity dates</Link> to the contracts you upload and they show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(item => {
            const lapsed = item.status === 'expired'
            return (
              <li key={item.id}>
                <Link href={item.href} className="flex items-start gap-3 py-2.5 px-1 hover:bg-gray-50 rounded transition-colors">
                  <FileSignature className={`w-4 h-4 mt-0.5 shrink-0 ${lapsed ? 'text-red-600' : 'text-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">
                      {item.supplier?.name ?? 'Supplier'}
                      {item.property?.name && <span className="text-gray-500"> · {item.property.name}</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {CONTRACT_DOCUMENT_TYPE_LABELS[item.documentType as ContractDocumentType] ?? item.documentType}: {item.title}
                      {' · '}{today ? describeExpiry(today, item.validTo) : ''} ({fmtDate(item.validTo)})
                    </p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 border ${lapsed ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                    {lapsed ? 'expired' : `${item.daysLeft}d`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
