'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt, Plus, Search, Upload, Loader2, X, Sparkles } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'

const SYM: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
const money = (n: number, c = 'EUR') => `${SYM[c] || c + ' '}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS_BADGE: Record<string, string> = {
  received: 'bg-gray-100 text-gray-600', matched: 'bg-blue-100 text-blue-700',
  approved: 'bg-indigo-100 text-indigo-700', paid: 'bg-green-100 text-green-700',
  disputed: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400',
}
const MATCH_BADGE: Record<string, string> = {
  unmatched: 'bg-amber-100 text-amber-700', partial: 'bg-orange-100 text-orange-700',
  matched: 'bg-green-100 text-green-700', discrepancy: 'bg-red-100 text-red-700',
}

interface Invoice {
  id: string; internal_reference: string | null; supplier_invoice_number: string; supplier_name: string
  invoice_date: string; amount: number; currency: string; status: string; match_status: string
}
interface Summary { total: number; total_amount: number; unmatched: number; approved: number; paid: number; disputed: number }

const BLANK = { supplier_invoice_number: '', supplier_name: '', invoice_date: '', due_date: '', amount: '', currency: 'EUR', tax_amount: '', description: '' }

export default function SupplierInvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [matchFilter, setMatchFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parseNote, setParseNote] = useState<string | null>(null)

  const fetchInvoices = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (statusFilter) p.set('status', statusFilter)
      if (matchFilter) p.set('matchStatus', matchFilter)
      if (search) p.set('supplierName', search)
      const res = await fetch(`/api/supplier-invoices?${p}`)
      const data = await res.json()
      if (data.success) { setInvoices(data.data); setSummary(data.summary) }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [statusFilter, matchFilter, search])

  useEffect(() => {
    const t = setTimeout(fetchInvoices, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchInvoices, search])

  const onParse = async (file: File) => {
    setParsing(true); setParseNote(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/ai/parse-supplier-invoice', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        const d = data.data
        setForm({
          supplier_invoice_number: d.supplier_invoice_number || '', supplier_name: d.supplier_name || '',
          invoice_date: d.invoice_date || '', due_date: d.due_date || '', amount: String(d.total_amount || ''),
          currency: d.currency || 'EUR', tax_amount: String(d.tax_amount || ''), description: d.description || '',
        })
        setParseNote(d.notes || 'Extracted — please review the fields below.')
      } else { setParseNote(data.error || 'Could not parse the document.') }
    } catch (e: any) { setParseNote(e?.message || 'Parse failed') } finally { setParsing(false) }
  }

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const res = await fetch('/api/supplier-invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0, tax_amount: parseFloat(form.tax_amount) || 0 }),
      })
      const data = await res.json()
      if (data.success) { setShowModal(false); setForm({ ...BLANK }); setParseNote(null); router.push(`/supplier-invoices/${data.data.id}`) }
      else showToast('error', data.error || 'Failed to create')
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><Receipt className="h-5 w-5 text-gray-500" /></div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Supplier Invoices</h1>
            <p className="text-sm text-gray-500">Accounts payable — match, approve, and pay supplier bills</p>
          </div>
        </div>
        <button onClick={() => { setForm({ ...BLANK }); setParseNote(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238]">
          <Plus className="h-4 w-4" /> New Invoice
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Total" value={String(summary.total)} sub={money(summary.total_amount)} />
          <Stat label="Unmatched" value={String(summary.unmatched)} accent="text-amber-600" />
          <Stat label="Approved" value={String(summary.approved)} accent="text-indigo-600" />
          <Stat label="Paid" value={String(summary.paid)} accent="text-green-600" />
          <Stat label="Disputed" value={String(summary.disputed)} accent="text-red-600" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">All statuses</option>{['received', 'matched', 'approved', 'paid', 'disputed', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={matchFilter} onChange={e => setMatchFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">All match states</option>{['unmatched', 'partial', 'matched', 'discrepancy'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-[#647C47] animate-spin" /></div>
      ) : invoices.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
          <Receipt className="h-10 w-10 mx-auto mb-2 text-gray-300" /> No supplier invoices yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
          {invoices.map(inv => (
            <button key={inv.id} onClick={() => router.push(`/supplier-invoices/${inv.id}`)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{inv.supplier_name}</span>
                  <span className="text-xs text-gray-400">{inv.internal_reference || inv.supplier_invoice_number}</span>
                </div>
                <div className="text-xs text-gray-500">{inv.supplier_invoice_number} · {inv.invoice_date}</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${MATCH_BADGE[inv.match_status] || ''}`}>{inv.match_status}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[inv.status] || ''}`}>{inv.status}</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums w-28 text-right">{money(inv.amount, inv.currency)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">New Supplier Invoice</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={onSave} className="p-4 space-y-3">
              {/* AI parse */}
              <label className="flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-[#647C47] text-sm text-gray-600">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-[#647C47]" />}
                {parsing ? 'Reading invoice…' : 'Upload a PDF/image to auto-extract'}
                <input type="file" accept="application/pdf,image/*" className="hidden" disabled={parsing}
                  onChange={e => { const f = e.target.files?.[0]; if (f) onParse(f) }} />
              </label>
              {parseNote && <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">{parseNote}</p>}

              <Field label="Supplier name *"><input required value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })} className={inp} /></Field>
              <Field label="Invoice number *"><input required value={form.supplier_invoice_number} onChange={e => setForm({ ...form, supplier_invoice_number: e.target.value })} className={inp} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Invoice date *"><input required type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} className={inp} /></Field>
                <Field label="Due date"><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={inp} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Amount *"><input required type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={inp} /></Field>
                <Field label="Tax"><input type="number" step="0.01" value={form.tax_amount} onChange={e => setForm({ ...form, tax_amount: e.target.value })} className={inp} /></Field>
                <Field label="Currency"><select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className={inp}>{SUPPORTED_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></Field>
              </div>
              <Field label="Description"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className={inp} /></Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50">{saving ? 'Saving…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]'
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>{children}</div>
}
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-semibold ${accent || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}
