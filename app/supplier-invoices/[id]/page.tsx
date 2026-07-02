'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, FileText, Check, DollarSign, AlertTriangle, Upload, Link2, X, Trash2 } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { useConfirmDialog } from '@/components/ConfirmDialog'

const SYM: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
const money = (n: number, c = 'EUR') => `${SYM[c] || c + ' '}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const STATUS_BADGE: Record<string, string> = { received: 'bg-gray-100 text-gray-600', matched: 'bg-blue-100 text-blue-700', approved: 'bg-indigo-100 text-indigo-700', paid: 'bg-green-100 text-green-700', disputed: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400' }
const MATCH_BADGE: Record<string, string> = { unmatched: 'bg-amber-100 text-amber-700', partial: 'bg-orange-100 text-orange-700', matched: 'bg-green-100 text-green-700', discrepancy: 'bg-red-100 text-red-700' }

export default function SupplierInvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const dialog = useConfirmDialog()
  const [inv, setInv] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [expenses, setExpenses] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/supplier-invoices/${id}`)
      const data = await res.json()
      if (data.success) setInv(data.data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [id])
  useEffect(() => { load() }, [load])

  const openLink = async () => {
    setShowLink(true); setSelected(new Set())
    try {
      const res = await fetch('/api/expenses')
      if (res.ok) { const data = await res.json(); setExpenses(Array.isArray(data) ? data : (data.data || [])) }
    } catch (e) { console.error(e) }
  }

  const action = async (key: string, fn: () => Promise<Response>) => {
    setBusy(key)
    try { const res = await fn(); const d = await res.json(); if (!res.ok || d.success === false) showToast('error', d.error || 'Action failed'); await load() }
    catch (e) { console.error(e) } finally { setBusy(null) }
  }

  const linkSelected = () => action('link', () => fetch(`/api/supplier-invoices/${id}/match`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseIds: [...selected] }),
  })).then(() => setShowLink(false))

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 text-[#647C47] animate-spin" /></div>
  if (!inv) return <div className="p-6 text-gray-500">Invoice not found.</div>

  const matchedExpenses = inv.matched_expenses || []
  const lineItems = Array.isArray(inv.line_items) ? inv.line_items : []
  const canApprove = inv.match_status === 'matched' && !['approved', 'paid', 'cancelled'].includes(inv.status)
  const canPay = inv.status === 'approved'

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <button onClick={() => router.push('/supplier-invoices')} className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Supplier invoices
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{inv.supplier_name}</h1>
            <p className="text-sm text-gray-500">{inv.supplier_invoice_number} · {inv.internal_reference}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${MATCH_BADGE[inv.match_status] || ''}`}>{inv.match_status}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[inv.status] || ''}`}>{inv.status}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-gray-900">{money(inv.amount, inv.currency)}</p>
            {Number(inv.tax_amount) > 0 && <p className="text-xs text-gray-400">incl. tax {money(inv.tax_amount, inv.currency)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
          <KV k="Invoice date" v={inv.invoice_date} />
          <KV k="Due date" v={inv.due_date || '—'} />
          <KV k="Matched" v={money(inv.matched_amount, inv.currency)} />
          <KV k="Discrepancy" v={money(inv.discrepancy_amount, inv.currency)} accent={Math.abs(Number(inv.discrepancy_amount)) > 0.01 ? 'text-red-600' : ''} />
        </div>
        {inv.description && <p className="text-sm text-gray-600 mt-3">{inv.description}</p>}
        {inv.document_url && (
          <a href={inv.document_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-[#647C47] hover:underline">
            <FileText className="h-4 w-4" /> {inv.document_filename || 'View document'}
          </a>
        )}
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Line items</h3>
          <div className="divide-y divide-gray-100 text-sm">
            {lineItems.map((li: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="text-gray-700">{li.description} {li.quantity ? <span className="text-gray-400">×{li.quantity}</span> : null}</span>
                <span className="tabular-nums text-gray-800">{money(li.amount, inv.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matched expenses */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800">Matched expenses</h3>
          <button onClick={openLink} className="text-xs font-medium text-[#647C47] hover:underline inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Link expenses</button>
        </div>
        {matchedExpenses.length === 0 ? (
          <p className="text-sm text-gray-400">No expenses linked yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 text-sm">
            {matchedExpenses.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-1.5">
                <span className="text-gray-700">{m.expense?.description || m.expense?.expense_number || 'Expense'}</span>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-gray-800">{money(m.matched_amount, inv.currency)}</span>
                  <button onClick={() => action('unlink', () => fetch(`/api/supplier-invoices/${id}/match`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseId: m.expense_id }) }))}
                    className="text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer inline-flex items-center gap-1">
          <Upload className="h-3.5 w-3.5" /> {busy === 'upload' ? 'Uploading…' : 'Upload document'}
          <input type="file" accept="application/pdf,image/*" className="hidden" disabled={busy === 'upload'}
            onChange={e => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append('file', f); action('upload', () => fetch(`/api/supplier-invoices/${id}/upload`, { method: 'POST', body: fd })) } }} />
        </label>
        <button disabled={busy !== null || inv.status === 'disputed'} onClick={() => { const r = prompt('Reason for dispute:'); if (r != null) action('dispute', () => fetch(`/api/supplier-invoices/${id}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: r }) })) }}
          className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Dispute</button>
        <div className="ml-auto flex items-center gap-2">
          <button disabled={busy !== null || (!canApprove && inv.match_status !== 'discrepancy' && inv.match_status !== 'partial')} onClick={async () => { const override = inv.match_status !== 'matched'; if (override && !(await dialog.confirm({ message: 'Invoice is not fully matched. Approve with a discrepancy?', variant: 'warning' }))) return; action('approve', () => fetch(`/api/supplier-invoices/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ override }) })) }}
            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Approve</button>
          <button disabled={busy !== null || !canPay} onClick={() => { const ref = prompt('Payment reference (optional):') || undefined; action('pay', () => fetch(`/api/supplier-invoices/${id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_reference: ref }) })) }}
            className="px-4 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50 inline-flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Mark paid</button>
        </div>
      </div>

      {/* Link expenses modal */}
      {showLink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Link expenses</h2>
              <button onClick={() => setShowLink(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {expenses.length === 0 ? <p className="text-sm text-gray-400 p-4 text-center">No expenses found.</p> : expenses.map(ex => (
                <label key={ex.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input type="checkbox" checked={selected.has(ex.id)} onChange={e => { const s = new Set(selected); e.target.checked ? s.add(ex.id) : s.delete(ex.id); setSelected(s) }} className="rounded border-gray-300 text-[#647C47]" />
                  <span className="flex-1 text-sm text-gray-700 truncate">{ex.description || ex.expense_number || 'Expense'}</span>
                  <span className="text-sm tabular-nums text-gray-600">{money(ex.amount, ex.currency || inv.currency)}</span>
                </label>
              ))}
            </div>
            <div className="p-3 border-t border-gray-200 flex gap-2">
              <button onClick={() => setShowLink(false)} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={linkSelected} disabled={selected.size === 0 || busy === 'link'} className="flex-1 px-3 py-2 text-sm text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50">Link {selected.size || ''}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KV({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return <div><p className="text-xs text-gray-400">{k}</p><p className={`text-gray-800 ${accent || ''}`}>{v}</p></div>
}
