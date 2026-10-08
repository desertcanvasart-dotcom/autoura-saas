'use client'

// The trip's invoices and the payments against each, in its Finance tab, with
// Record payment right here — the same call the invoice page makes
// (POST /api/invoices/[id]/payments; a trigger moves the invoice's paid,
// balance and status). The P&L reads these same invoices (lib/trip-pnl.ts).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Receipt } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { PAYMENT_METHODS } from '@/lib/payment-input'
import { withReturnTo } from '@/lib/nav/return-to'

interface Invoice {
  id: string
  invoice_number: string
  invoice_type: string | null
  status: string
  currency: string
  total_amount: number
  amount_paid: number
  balance_due: number
  issue_date: string | null
  due_date: string | null
}

interface Payment {
  id: string
  amount: number
  currency: string
  payment_method: string | null
  payment_date: string
  transaction_reference: string | null
}

/** The methods invoice_payments accepts (its CHECK, migration 400). */
const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank transfer', cash: 'Cash', credit_card: 'Credit card',
  paypal: 'PayPal', stripe: 'Stripe', tab: 'Tab', other: 'Other',
}

const STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-50 text-blue-700',
  partial: 'bg-amber-50 text-amber-800',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const money = (currency: string, n: number) => `${currency} ${Number(n || 0).toFixed(2)}`
const shortDate = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
const typeLabel = (t: string | null) => (t && t !== 'standard' ? t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : null)

export default function InvoicesPayments({ itineraryId, today, onCreateInvoice, creatingInvoice, onChanged, openSignal = 0, onOpened }: {
  itineraryId: string
  /** YYYY-MM-DD: the default payment date, and "overdue". */
  today: string
  /** No invoice yet: the page's own Create invoice. */
  onCreateInvoice: () => void
  creatingInvoice?: boolean
  /** After a payment: the page refreshes its money (the P&L, the side panel). */
  onChanged?: () => void
  /** Bump to open Record payment on the first invoice with a balance (the header's main button). */
  openSignal?: number
  /** The signal was acted on: the page clears it, so a later visit to the tab opens nothing. */
  onOpened?: () => void
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [payments, setPayments] = useState<Record<string, Payment[]>>({})
  const [failed, setFailed] = useState(false)
  const [recording, setRecording] = useState<string | null>(null)
  const [form, setForm] = useState({ amount: '', payment_method: 'bank_transfer', payment_date: today, transaction_reference: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices?itineraryId=${encodeURIComponent(itineraryId)}`)
      const list = await res.json()
      if (!res.ok || !Array.isArray(list)) throw new Error('failed')
      const sorted = (list as Invoice[]).sort((a, b) => String(a.issue_date ?? '').localeCompare(String(b.issue_date ?? '')))
      setInvoices(sorted)
      setFailed(false)
      const entries = await Promise.all(sorted.map(async inv => {
        const r = await fetch(`/api/invoices/${inv.id}/payments`).then(x => x.json()).catch(() => [])
        return [inv.id, Array.isArray(r) ? (r as Payment[]) : []] as const
      }))
      setPayments(Object.fromEntries(entries))
    } catch {
      setFailed(true)
    }
  }, [itineraryId])

  useEffect(() => { load() }, [load])

  const startRecording = useCallback((inv: Invoice) => {
    setRecording(inv.id)
    setForm({ amount: Math.max(0, Number(inv.balance_due) || 0).toFixed(2), payment_method: 'bank_transfer', payment_date: today, transaction_reference: '' })
  }, [today])

  // A signal can arrive before the invoices have loaded (the tab mounts this
  // card as it opens), so it waits for them — and each signal acts once.
  const handled = useRef(0)
  useEffect(() => {
    if (openSignal === 0) { handled.current = 0; return }
    if (openSignal === handled.current || !invoices) return
    handled.current = openSignal
    const due = invoices.find(i => i.status !== 'cancelled' && Number(i.balance_due) > 0.005)
    if (due) startRecording(due)
    onOpened?.()
  }, [openSignal, invoices, startRecording, onOpened])

  const save = async (inv: Invoice) => {
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) { showToast('error', 'Enter the amount received'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/invoices/${inv.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency: inv.currency,
          payment_method: form.payment_method,
          payment_date: form.payment_date,
          transaction_reference: form.transaction_reference.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not record the payment')
      showToast('success', `Payment of ${money(inv.currency, amount)} recorded on ${inv.invoice_number}`)
      setRecording(null)
      await load()
      onChanged?.()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not record the payment')
    } finally {
      setSaving(false)
    }
  }

  const live = (invoices ?? []).filter(i => i.status !== 'cancelled')
  const currency = live[0]?.currency ?? invoices?.[0]?.currency ?? ''
  const oneCurrency = live.every(i => i.currency === currency)
  const totals = live.reduce((t, i) => ({ invoiced: t.invoiced + Number(i.total_amount || 0), paid: t.paid + Number(i.amount_paid || 0), due: t.due + Number(i.balance_due || 0) }), { invoiced: 0, paid: 0, due: 0 })

  return (
    <div id="invoices-payments" className="bg-white rounded-lg border border-gray-200 shadow-sm scroll-mt-40">
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Receipt className="w-4 h-4 text-gray-500" /> Invoices &amp; payments</h3>
        {live.length > 0 && oneCurrency && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            <span>Invoiced <span className="font-semibold text-gray-900">{money(currency, totals.invoiced)}</span></span>
            <span>Paid <span className="font-semibold text-gray-900">{money(currency, totals.paid)}</span></span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${totals.due > 0.005 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
              {totals.due > 0.005 ? `Balance due ${money(currency, totals.due)}` : 'Paid in full'}
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        {invoices === null && !failed && <p className="text-xs text-gray-400">Loading…</p>}
        {failed && <p className="text-xs text-gray-500">Could not load the invoices.</p>}
        {invoices && invoices.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500">No invoice yet.</p>
            <button type="button" onClick={onCreateInvoice} disabled={creatingInvoice} className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
              {creatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create invoice
            </button>
          </div>
        )}

        {invoices && invoices.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {invoices.map(inv => {
              const due = Number(inv.balance_due) || 0
              const overdue = inv.status !== 'paid' && inv.status !== 'cancelled' && due > 0.005 && !!inv.due_date && inv.due_date.slice(0, 10) < today
              const status = overdue ? 'overdue' : inv.status
              const list = payments[inv.id] ?? []
              return (
                <li key={inv.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={withReturnTo(`/invoices/${inv.id}`, `/itineraries/${itineraryId}`)} className="text-sm font-medium text-primary-700 hover:underline">{inv.invoice_number}</Link>
                        {typeLabel(inv.invoice_type) && <span className="text-xs text-gray-500">{typeLabel(inv.invoice_type)}</span>}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS[status] ?? 'bg-gray-100 text-gray-700'}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {inv.issue_date && <>Issued {shortDate(inv.issue_date)}</>}
                        {inv.due_date && <span className={overdue ? 'text-red-600 font-medium' : ''}> · due {shortDate(inv.due_date)}</span>}
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-600">
                      <p className="text-sm font-semibold text-gray-900">{money(inv.currency, inv.total_amount)}</p>
                      <p>Paid {money(inv.currency, inv.amount_paid)}{due > 0.005 && <> · <span className="text-amber-700 font-medium">due {money(inv.currency, due)}</span></>}</p>
                    </div>
                  </div>

                  {list.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {list.map(p => (
                        <li key={p.id} className="flex flex-wrap justify-between gap-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                          <span>{shortDate(p.payment_date)} · {METHOD_LABELS[p.payment_method ?? ''] ?? p.payment_method ?? '—'}{p.transaction_reference && <span className="text-gray-400"> · {p.transaction_reference}</span>}</span>
                          <span className="font-medium text-gray-900">{money(p.currency || inv.currency, p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {inv.status !== 'cancelled' && due > 0.005 && recording !== inv.id && (
                    <button type="button" onClick={() => startRecording(inv)} className="mt-2 text-xs font-medium text-primary-600 hover:underline">Record payment</button>
                  )}

                  {recording === inv.id && (
                    <form
                      className="mt-2 grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto] gap-2 items-end bg-gray-50 border border-gray-200 rounded-md p-2"
                      onSubmit={e => { e.preventDefault(); save(inv) }}
                    >
                      <label className="text-xs text-gray-600">Amount ({inv.currency})
                        <input type="number" step="0.01" min="0.01" max={due.toFixed(2)} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-0.5 w-full px-2 py-1 text-sm border border-gray-300 rounded" required />
                      </label>
                      <label className="text-xs text-gray-600">Method
                        <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="mt-0.5 w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white">
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m] ?? m}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-gray-600">Date
                        <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="mt-0.5 w-full px-2 py-1 text-sm border border-gray-300 rounded" required />
                      </label>
                      <label className="text-xs text-gray-600">Reference
                        <input type="text" value={form.transaction_reference} onChange={e => setForm(f => ({ ...f, transaction_reference: e.target.value }))} className="mt-0.5 w-full px-2 py-1 text-sm border border-gray-300 rounded" placeholder="Optional" />
                      </label>
                      <div className="flex gap-1 col-span-2 sm:col-span-1">
                        <button type="submit" disabled={saving} className="px-3 py-1 text-sm font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1">
                          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                        </button>
                        <button type="button" onClick={() => setRecording(null)} className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                      </div>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
