'use client'

// ============================================
// The Documents tab of the supplier view modal
// ============================================
// The contracts, rate sheets and allotment agreements a company holds with
// this supplier — uploaded here, opened through a short-lived signed URL,
// never a permanent link. A document can cover the whole supplier or one of
// its properties (a cruise line's agreement for a specific ship).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Download, ExternalLink, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Pencil, Plus, Trash2, Upload, X,
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { showToast } from '@/app/contexts/ToastContext'
import { todayLocal } from '@/lib/today'
import {
  CONTRACT_ACCEPT,
  CONTRACT_DOCUMENT_TYPES,
  CONTRACT_DOCUMENT_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  MAX_CONTRACT_BYTES,
  contractStatus,
  formatBytes,
  titleFromFilename,
  type ContractDocumentType,
  type ContractStatus,
  type SupplierContract,
} from '@/lib/supplier-contracts'
import type { SupplierProperty } from '@/lib/supplier-properties'

interface Props {
  supplierId: string
}

type Draft = {
  id?: string
  file: File | null
  title: string
  document_type: ContractDocumentType
  property_id: string
  valid_from: string
  valid_to: string
  notes: string
}

const EMPTY: Draft = { file: null, title: '', document_type: 'contract', property_id: '', valid_from: '', valid_to: '', notes: '' }

const STATUS_STYLE: Record<ContractStatus, string> = {
  active: 'bg-green-100 text-green-700',
  expiring: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  upcoming: 'bg-blue-100 text-blue-700',
  undated: 'bg-gray-100 text-gray-600',
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

function FileIcon({ mime, className }: { mime: string; className: string }) {
  if (mime.startsWith('image/')) return <ImageIcon className={className} />
  if (mime.includes('spreadsheet')) return <FileSpreadsheet className={className} />
  return <FileText className={className} />
}

function fmtDate(d: string | null) {
  if (!d) return null
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SupplierDocumentsPanel({ supplierId }: Props) {
  const dialog = useConfirmDialog()
  const [contracts, setContracts] = useState<SupplierContract[]>([])
  const [properties, setProperties] = useState<SupplierProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const today = todayLocal()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/suppliers/${supplierId}/contracts`),
        fetch(`/api/suppliers/${supplierId}/properties`),
      ])
      const c = await cRes.json().catch(() => ({}))
      const p = await pRes.json().catch(() => ({}))
      if (cRes.ok && c.success) setContracts(c.data || [])
      else setError(c.error || 'Could not load documents')
      if (pRes.ok && p.success) setProperties(p.data || [])
    } catch {
      setError('Could not load documents')
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  useEffect(() => { void load() }, [load])

  const pickFile = (file: File | null) => {
    if (!draft) return
    if (file && file.size > MAX_CONTRACT_BYTES) {
      setError(`"${file.name}" is larger than 20 MB.`)
      return
    }
    setError(null)
    setDraft({ ...draft, file, title: draft.title || (file ? titleFromFilename(file.name) : '') })
  }

  const save = async () => {
    if (!draft || saving) return
    if (!draft.id && !draft.file) { setError('Choose a file to upload.'); return }
    setSaving(true)
    setError(null)
    try {
      let res: Response
      if (draft.id) {
        res = await fetch(`/api/suppliers/${supplierId}/contracts/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: draft.title, document_type: draft.document_type, property_id: draft.property_id,
            valid_from: draft.valid_from, valid_to: draft.valid_to, notes: draft.notes,
          }),
        })
      } else {
        const fd = new FormData()
        fd.append('file', draft.file as File)
        fd.append('title', draft.title)
        fd.append('document_type', draft.document_type)
        fd.append('property_id', draft.property_id)
        fd.append('valid_from', draft.valid_from)
        fd.append('valid_to', draft.valid_to)
        fd.append('notes', draft.notes)
        res = await fetch(`/api/suppliers/${supplierId}/contracts`, { method: 'POST', body: fd })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not save the document')
        return
      }
      showToast('success', draft.id ? 'Document updated' : 'Document uploaded')
      setDraft(null)
      await load()
    } catch {
      setError('Could not save the document')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (c: SupplierContract) => {
    const ok = await dialog.confirmDelete('Document', `Delete "${c.title}"? The file is removed permanently.`)
    if (!ok) return
    setError(null)
    const res = await fetch(`/api/suppliers/${supplierId}/contracts/${c.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      setError(data.error || 'Could not delete the document')
      return
    }
    showToast('success', 'Document deleted')
    await load()
  }

  const openUrl = (c: SupplierContract, download = false) =>
    `/api/suppliers/${supplierId}/contracts/${c.id}${download ? '?download=1' : ''}`

  const startEdit = (c: SupplierContract) => setDraft({
    id: c.id, file: null, title: c.title,
    document_type: (CONTRACT_DOCUMENT_TYPES as readonly string[]).includes(c.document_type) ? c.document_type as ContractDocumentType : 'other',
    property_id: c.property_id || '', valid_from: c.valid_from?.slice(0, 10) || '', valid_to: c.valid_to?.slice(0, 10) || '', notes: c.notes || '',
  })

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {contracts.length === 0 && !draft && (
        <div className="text-center py-6 text-gray-500">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm">No documents yet. Upload the contracts, rate sheets and allotment agreements you hold with this supplier.</p>
        </div>
      )}

      {contracts.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Document</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Type</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Validity</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {contracts.map(c => {
              const status = contractStatus(c.valid_from, c.valid_to, today)
              const from = fmtDate(c.valid_from)
              const to = fmtDate(c.valid_to)
              return (
                <tr key={c.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <FileIcon mime={c.mime_type} className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <a href={openUrl(c)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-900 hover:text-primary-600 break-words">{c.title}</a>
                        <p className="text-xs text-gray-400 truncate">
                          {c.property?.name ? <span className="text-gray-500">{c.property.name} · </span> : null}
                          {c.original_filename || 'file'} · {formatBytes(c.size_bytes)}
                        </p>
                        {c.notes && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{c.notes}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
                    {CONTRACT_DOCUMENT_TYPE_LABELS[c.document_type as ContractDocumentType] ?? c.document_type}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[status]}`}>{CONTRACT_STATUS_LABELS[status]}</span>
                    {(from || to) && (
                      <p className="text-xs text-gray-500 mt-1">{from ?? '…'} – {to ?? 'open'}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <a href={openUrl(c)} target="_blank" rel="noopener noreferrer" className="inline-block p-1.5 text-gray-400 hover:text-primary-600" title="Open"><ExternalLink className="w-4 h-4" /></a>
                    <a href={openUrl(c, true)} className="inline-block p-1.5 text-gray-400 hover:text-primary-600" title="Download"><Download className="w-4 h-4" /></a>
                    <button type="button" onClick={() => startEdit(c)} className="p-1.5 text-gray-400 hover:text-primary-600" title="Edit details"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => void remove(c)} className="p-1.5 text-gray-400 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {draft ? (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">{draft.id ? 'Edit document details' : 'Upload document'}</h4>
            <button type="button" onClick={() => setDraft(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {!draft.id && (
            <div>
              <input
                ref={fileInput}
                type="file"
                accept={CONTRACT_ACCEPT}
                className="hidden"
                onChange={e => pickFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0] ?? null) }}
                className="w-full flex items-center justify-center gap-2 px-3 py-4 text-sm border-2 border-dashed border-gray-300 rounded-lg bg-white hover:border-primary-400 hover:bg-primary-50 text-gray-600"
              >
                <Upload className="w-4 h-4" />
                {draft.file ? <span className="font-medium text-gray-900">{draft.file.name} <span className="text-gray-400 font-normal">· {formatBytes(draft.file.size)}</span></span> : 'Choose a file or drop it here — PDF, image, Word or Excel, up to 20 MB'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Title *</label>
              <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={inputCls} placeholder="e.g. 2026–27 contract rates" />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select value={draft.document_type} onChange={e => setDraft({ ...draft, document_type: e.target.value as ContractDocumentType })} className={inputCls}>
                {CONTRACT_DOCUMENT_TYPES.map(t => <option key={t} value={t}>{CONTRACT_DOCUMENT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Covers</label>
              <select value={draft.property_id} onChange={e => setDraft({ ...draft, property_id: e.target.value })} className={inputCls} disabled={properties.length === 0}>
                <option value="">Whole supplier</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Valid from</label>
              <input type="date" value={draft.valid_from} onChange={e => setDraft({ ...draft, valid_from: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Valid to</label>
              <input type="date" value={draft.valid_to} min={draft.valid_from || undefined} onChange={e => setDraft({ ...draft, valid_to: e.target.value })} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} rows={2} className={inputCls} placeholder="Payment terms, release periods, who signed…" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !draft.title.trim() || (!draft.id && !draft.file)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {draft.id ? 'Save' : 'Upload'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setError(null); setDraft({ ...EMPTY }) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50"
        >
          <Plus className="w-4 h-4" /> Upload document
        </button>
      )}
    </div>
  )
}
