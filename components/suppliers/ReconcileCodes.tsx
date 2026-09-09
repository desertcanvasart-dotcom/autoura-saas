'use client'

// Phase 4 UI: the one-time supplier_code reconciliation. The operator uploads
// the other install's supplier export (Code/Name/Email/Phone/…); this previews
// how each row pairs to a supplier here (by email/phone), then stamps the code
// onto the confident single matches. Everything ambiguous / unmatched /
// conflicting is left for manual pairing and can be downloaded as a CSV.
import { useRef, useState } from 'react'
import { Link2, Upload, X, Loader2, Download } from 'lucide-react'

type Row = Record<string, any>
interface Plan {
  summary: { total: number; match: number; already: number; ambiguous: number; no_match: number; conflict: number }
  rows?: Row[]
  stamped?: number
  unresolved?: Row[]
  applyErrors?: Array<{ code: string; supplier_id: string; message: string }>
}

export default function ReconcileCodes({ onApplied }: { onApplied?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Plan | null>(null)
  const [applied, setApplied] = useState<Plan | null>(null)

  const reset = () => { setCsv(null); setFileName(''); setPreview(null); setApplied(null); setError(null) }
  const close = () => { setOpen(false); reset() }

  const onFile = async (file: File) => {
    reset()
    setFileName(file.name)
    const text = await file.text()
    setCsv(text)
    setBusy(true)
    try {
      const res = await fetch('/api/suppliers/reconcile-codes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: text, dryRun: true }),
      })
      const json = await res.json()
      if (!json.success) setError(json.error || 'Preview failed')
      else setPreview(json)
    } catch (e: any) { setError(e?.message || 'Preview failed') } finally { setBusy(false) }
  }

  const apply = async () => {
    if (!csv) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/suppliers/reconcile-codes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: csv, dryRun: false }),
      })
      const json = await res.json()
      if (!json.success && !json.stamped) setError(json.error || 'Apply failed')
      setApplied(json)
      if (json.stamped > 0) onApplied?.()
    } catch (e: any) { setError(e?.message || 'Apply failed') } finally { setBusy(false) }
  }

  const downloadUnresolved = () => {
    const rows = applied?.unresolved ?? preview?.rows?.filter(r => r.status !== 'match' && r.status !== 'already') ?? []
    const header = 'code,status,reason,candidates'
    const body = rows.map(r => {
      const reason = r.reason ?? (r.status === 'ambiguous' ? 'multiple matches' : r.status === 'no_match' ? 'no email/phone match' : '')
      const cands = (r.candidates ?? []).map((c: any) => `${c.id} (${c.name})`).join('; ')
      return [r.code, r.status, reason, cands].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    }).join('\n')
    const blob = new Blob([`${header}\n${body}\n`], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'supplier-code-unresolved.csv'
    a.click()
  }

  const s = (applied ?? preview)?.summary
  const stat = (label: string, n: number, tone = 'text-gray-700') => (
    <div className="flex items-center justify-between text-sm py-0.5"><span className="text-gray-500">{label}</span><span className={`font-semibold ${tone}`}>{n}</span></div>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Match this tenant's suppliers to the other install's export and stamp the shared code"
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        <Link2 className="w-4 h-4" /> Reconcile Codes
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Link2 className="w-4 h-4" /> Reconcile supplier codes</h2>
              <button onClick={close} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              Upload the other install&apos;s <b>supplier export</b> (Code / Name / Email / Phone). Each row is matched to a
              supplier here by email or phone, and the shared code is stamped onto the single confident matches. Nothing
              else is changed.
            </p>

            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-dashed border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {fileName || 'Choose supplier CSV'}
            </button>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {s && (
              <div className="mt-4 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                {applied
                  ? stat('Stamped', applied.stamped ?? 0, 'text-green-700')
                  : stat('Will stamp (single match)', s.match, 'text-green-700')}
                {stat('Already correct', s.already)}
                {stat('Ambiguous — pair by hand', s.ambiguous, s.ambiguous ? 'text-amber-700' : 'text-gray-700')}
                {stat('No email/phone match', s.no_match, s.no_match ? 'text-amber-700' : 'text-gray-700')}
                {stat('Conflicts', s.conflict, s.conflict ? 'text-red-700' : 'text-gray-700')}
                {applied?.applyErrors && applied.applyErrors.length > 0 && (
                  <p className="mt-2 text-xs text-red-600">{applied.applyErrors.length} update(s) failed — see server logs.</p>
                )}
                {(s.ambiguous + s.no_match + s.conflict) > 0 && (
                  <button onClick={downloadUnresolved} className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900">
                    <Download className="w-3.5 h-3.5" /> Download the {s.ambiguous + s.no_match + s.conflict} to pair by hand
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={close} className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
              {preview && !applied && (
                <button onClick={apply} disabled={busy || preview.summary.match === 0} className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {busy ? 'Stamping…' : `Stamp ${preview.summary.match} code${preview.summary.match === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
