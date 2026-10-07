'use client'

// ============================================
// Settings → Day blocks
// ============================================
// The agency's standard days (migration 398), kept once: what each one
// includes and where its night is. The library is edited as a sheet —
// export it, change it in Excel or Google Sheets, import it back — and the
// import shows what it would add and change before anything is written.
//
// Each paid attraction is checked against the agency's own entrance fees
// (through its attraction names): one that lands on no fee would price as
// nothing, so it is shown here, before a trip is built from the block.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { AlertCircle, CheckCircle2, Download, Loader2, Moon, Trash2, Upload } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { DAY_TYPES, nightLabel, sheetRowFromBlock, SHEET_COLUMNS, type DayBlock } from '@/lib/day-blocks/blocks'
import { BLOCK_WRITE_DENIED } from '@/lib/day-blocks/access'

interface AttractionCheck { name: string; ok: boolean; fees?: string[]; problem?: string }
interface BlockRow extends DayBlock {
  id: string
  is_active: boolean
  attraction_checks: AttractionCheck[]
}
interface ImportSummary {
  added: string[]
  updated: { code: string; changed: string[] }[]
  unchanged: string[]
  problems: { row: number; code: string | null; errors: string[] }[]
  applied: boolean
}
interface Notice { kind: 'success' | 'error'; text: string }

const TYPE_LABEL: Record<string, string> = {
  arrival: 'Arrival', tour: 'Tour', transfer: 'Transfer', cruise: 'Cruise', free: 'Free', departure: 'Departure',
}
const GUIDE_LABEL: Record<string, string> = {
  egyptologist: 'Egyptologist', assistant: 'English-speaking assistant', spot: 'Spot guide', none: 'No guide',
}

function mealsLabel(b: DayBlock): string {
  const parts = (['breakfast', 'lunch', 'dinner'] as const)
    .filter(m => b.meals?.[m]?.included)
    .map(m => `${m[0].toUpperCase()}${m.slice(1)}${b.meals[m].venue ? ` (${b.meals[m].venue})` : ''}`)
  return parts.length ? parts.join(', ') : 'No meals'
}

export default function DayBlocksPage() {
  const dialog = useConfirmDialog()
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [pending, setPending] = useState<{ csv: string; fileName: string; summary: ImportSummary } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/day-blocks')
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) { setState('failed'); return }
      setBlocks(json.data.blocks)
      setCanWrite(Boolean(json.data.canWrite))
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return blocks.filter(b =>
      (typeFilter === 'all' || b.day_type === typeFilter) &&
      (!q || [b.code, b.name, b.city, b.to_city, ...b.shorthand, ...b.attractions].some(v => String(v ?? '').toLowerCase().includes(q))))
  }, [blocks, query, typeFilter])

  const unpriced = blocks.filter(b => b.is_active && b.attraction_checks.some(c => !c.ok)).length

  const sendImport = async (csv: string, apply: boolean): Promise<ImportSummary | null> => {
    const res = await fetch('/api/day-blocks/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv, apply }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.success) {
      setNotice({ kind: 'error', text: json?.error || 'The import did not go through. Try again.' })
      return null
    }
    return json.data as ImportSummary
  }

  const onFile = async (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      setNotice({ kind: 'error', text: 'Save the sheet as CSV (File → Download → CSV in Google Sheets, or Save As → CSV in Excel), then import that file.' })
      return
    }
    setBusy('import')
    setNotice(null)
    try {
      const csv = await file.text()
      const summary = await sendImport(csv, false)
      if (summary) setPending({ csv, fileName: file.name, summary })
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const applyImport = async () => {
    if (!pending) return
    setBusy('apply')
    try {
      const summary = await sendImport(pending.csv, true)
      if (!summary) return
      setPending(null)
      setNotice({ kind: 'success', text: `Imported: ${summary.added.length} added, ${summary.updated.length} updated.` })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const exportSheet = () => {
    const csv = Papa.unparse({ fields: [...SHEET_COLUMNS], data: blocks.map(b => SHEET_COLUMNS.map(c => sheetRowFromBlock(b)[c])) })
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `day-blocks-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const setActive = async (b: BlockRow, isActive: boolean) => {
    setBusy(b.id)
    try {
      const res = await fetch(`/api/day-blocks/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: isActive }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) { setNotice({ kind: 'error', text: json?.error || 'That did not save.' }); return }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const remove = async (b: BlockRow) => {
    const ok = await dialog.confirm({ message: `Remove ${b.code} (${b.name}) from your day blocks?`, variant: 'danger', confirmText: 'Remove' })
    if (!ok) return
    setBusy(b.id)
    try {
      const res = await fetch(`/api/day-blocks/${b.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) { setNotice({ kind: 'error', text: json?.error || 'That did not remove.' }); return }
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">← Settings</Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-1">Day blocks</h1>
        <p className="text-sm text-gray-600 mt-1">
          Your standard days, kept once: what each includes and where its night is. Export the sheet, edit it in
          Excel or Google Sheets, and import it back &mdash; you see what changes before anything is saved.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canWrite ? (
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4a5c35] disabled:opacity-50"
            >
              {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import sheet (CSV)
            </button>
          </>
        ) : (
          <span className="text-xs text-gray-500">{BLOCK_WRITE_DENIED}</span>
        )}
        <button
          onClick={exportSheet}
          disabled={state !== 'ready'}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#647C47] border border-[#647C47]/40 rounded-lg hover:bg-[#647C47]/5 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> {blocks.length ? 'Export sheet' : 'Download an empty sheet'}
        </button>
      </div>

      {notice && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${notice.kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {notice.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
          {notice.text}
        </div>
      )}

      {pending && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900">{pending.fileName}: what the import would do</p>
          <ul className="text-sm text-gray-700 space-y-0.5">
            <li>{pending.summary.added.length} new block(s){pending.summary.added.length ? `: ${pending.summary.added.join(', ')}` : ''}</li>
            <li>
              {pending.summary.updated.length} changed
              {pending.summary.updated.length ? `: ${pending.summary.updated.map(u => `${u.code} (${u.changed.join(', ')})`).join('; ')}` : ''}
            </li>
            <li>{pending.summary.unchanged.length} unchanged</li>
          </ul>
          {pending.summary.problems.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-800">These rows cannot be read and will not be imported:</p>
              <ul className="text-xs text-red-800 space-y-0.5 mt-1">
                {pending.summary.problems.map(p => (
                  <li key={p.row}>Row {p.row}{p.code ? ` (${p.code})` : ''}: {p.errors.join(' ')}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-600">Blocks the sheet does not mention are kept as they are.</p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={applyImport}
              disabled={busy !== null || pending.summary.added.length + pending.summary.updated.length === 0}
              className="px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4a5c35] disabled:opacity-50"
            >
              {busy === 'apply' ? 'Importing…' : 'Import these changes'}
            </button>
            <button onClick={() => setPending(null)} className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {state === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}
      {state === 'failed' && <p className="text-sm text-red-700">Your day blocks could not be loaded. Refresh to try again.</p>}

      {state === 'ready' && (
        <>
          {unpriced > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-50 text-amber-900 border border-amber-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {unpriced} block(s) name an attraction that is not on your entrance fees, so it would price as nothing. Fix the
                name in the sheet, or say which fee it means in <Link href="/settings/attraction-aliases" className="underline">Attraction names</Link>.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search code, name, city, shorthand or attraction"
              className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg" aria-label="Day type">
              <option value="all">All day types</option>
              {DAY_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>

          {blocks.length === 0 ? (
            <p className="text-sm text-gray-500">No day blocks yet. Download the empty sheet, fill it in, and import it.</p>
          ) : (
            <div className="space-y-2">
              {shown.map(b => (
                <div key={b.id} className={`bg-white border rounded-lg p-4 ${b.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs px-1.5 py-0.5 bg-gray-100 rounded">{b.code}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#647C47]/10 text-[#4a5c35]">{TYPE_LABEL[b.day_type]}</span>
                        {!b.is_active && <span className="text-xs text-gray-500">Switched off</span>}
                      </div>
                      <p className="text-sm font-medium text-gray-900 mt-1">{b.name}</p>
                      <p className="text-xs text-gray-600 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>{b.city ?? 'Any city'}{b.to_city && b.to_city !== b.city ? ` → ${b.to_city}` : ''}</span>
                        <span className="flex items-center gap-1"><Moon className="w-3 h-3" /> {nightLabel(b)}</span>
                        <span>{GUIDE_LABEL[b.guide]}</span>
                        <span>{mealsLabel(b)}</span>
                      </p>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                          <input type="checkbox" checked={b.is_active} disabled={busy !== null} onChange={e => setActive(b, e.target.checked)} />
                          In use
                        </label>
                        <button onClick={() => remove(b)} disabled={busy !== null} className="p-1.5 text-gray-400 hover:text-red-600" aria-label={`Remove ${b.code}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {b.attraction_checks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {b.attraction_checks.map(c => (
                        <span
                          key={c.name}
                          title={c.ok ? `Priced as: ${c.fees?.join(' + ')}` : c.problem}
                          className={`text-xs px-2 py-0.5 rounded border ${c.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}
                        >
                          {c.ok ? '✓' : '!'} {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {b.attraction_checks.some(c => !c.ok) && (
                    <ul className="mt-1 text-xs text-amber-900 space-y-0.5">
                      {b.attraction_checks.filter(c => !c.ok).map(c => <li key={c.name}>{c.name}: {c.problem}</li>)}
                    </ul>
                  )}

                  <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                    {b.photo_stops.length > 0 && <p>Photo stops: {b.photo_stops.join(', ')}</p>}
                    {b.transport && <p>Transport: {b.transport}</p>}
                    {b.assistance.length > 0 && <p>Assistance: {b.assistance.join(', ')}</p>}
                    {b.shorthand.length > 0 && <p>Shorthand: {b.shorthand.join(' · ')}</p>}
                    {b.notes && <p>Notes: {b.notes}</p>}
                  </div>
                </div>
              ))}
              {shown.length === 0 && <p className="text-sm text-gray-500">No block matches.</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
