'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Plus } from 'lucide-react'
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from '@/lib/currency'
import { currencyName, PREFERRED_FIRST } from '@/lib/currency-names'
import { displayWithBuffer } from '@/lib/pricing/markup-wording'
import { SettingsCard, SettingsRow, NumberStepper, Note, SaveBar, useUnsavedGuard } from '@/components/settings/SettingsUI'

// Settings › Currencies & exchange rates (migration 456): the currency new
// quotes are shown in, the conversion buffer, and the rates — the shared API
// rate per currency and the company's own override with who set it and when.
// Clients are charged in the billing currency; all of this is display.

interface RateRow {
  currency: string
  api_rate: number | null
  override: { rate: number; set_by: string | null; set_at: string | null } | null
}
interface Data {
  base: string
  billing_currency: string | null
  default_quote_currency: string | null
  conversion_buffer_percent: number
  currencies_in_use: string[] | null
  rates: RateRow[]
  last_api_fetch: string | null
}
interface Draft {
  quoteCurrency: string
  buffer: number
  inUse: string[]
  /** currency → typed rate ('' = the API rate). */
  yourRate: Record<string, string>
}

const ALL = SUPPORTED_CURRENCIES as readonly string[]

function toDraft(d: Data): Draft {
  const billing = d.billing_currency || d.base
  return {
    quoteCurrency: d.default_quote_currency || billing,
    buffer: d.conversion_buffer_percent,
    inUse: [...(d.currencies_in_use ?? ALL)].filter(c => ALL.includes(c)),
    yourRate: Object.fromEntries(d.rates.map(r => [r.currency, r.override ? String(r.override.rate) : ''])),
  }
}

/** Day, month and a 24-hour time in the reader's own locale. */
function when(iso: string | null): string {
  if (!iso) return 'not yet'
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso))
}

const rateText = (n: number) => n.toFixed(4)

export default function CurrenciesSettingsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const j = await fetch('/api/settings/currencies').then(r => r.json()).catch(() => null)
    if (!j?.success) { setLoadError(j?.error || 'Could not load the currencies'); return }
    setData(j.data)
    setDraft(toDraft(j.data))
  }, [])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!adding) return
    const close = (e: MouseEvent) => { if (!addRef.current?.contains(e.target as Node)) setAdding(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [adding])

  const base = useMemo(() => (data ? toDraft(data) : null), [data])
  const changed = useMemo(() => {
    if (!base || !draft) return { quote: false, buffer: false, inUse: false, rates: [] as string[] }
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
    return {
      quote: base.quoteCurrency !== draft.quoteCurrency,
      buffer: base.buffer !== draft.buffer,
      inUse: !sameSet(base.inUse, draft.inUse),
      rates: Object.keys(draft.yourRate).filter(c => (base.yourRate[c] ?? '') !== draft.yourRate[c]),
    }
  }, [base, draft])
  const changes = (changed.quote ? 1 : 0) + (changed.buffer ? 1 : 0) + (changed.inUse ? 1 : 0) + changed.rates.length
  useUnsavedGuard(changes > 0)

  if (loadError) return <div className="px-4 sm:px-6 lg:px-8 py-6 text-sm text-red-600">{loadError}</div>
  if (!data || !draft) return <div className="px-4 sm:px-6 lg:px-8 py-10"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>

  const billing = data.billing_currency || data.base
  const rateOf = (code: string): number | null => {
    const typed = Number(draft.yourRate[code])
    if (draft.yourRate[code] !== '' && Number.isFinite(typed) && typed > 0) return typed
    return data.rates.find(r => r.currency === code)?.api_rate ?? null
  }
  // The buffer example: 1,000 in the billing currency shown in USD (or the
  // first other currency in use when the company bills in USD).
  const exampleTo = billing === 'USD' ? draft.inUse.find(c => c !== billing && c !== data.base) ?? 'EUR' : 'USD'
  const exampleRate = billing === data.base ? rateOf(exampleTo) : null
  const fmt = (code: string, n: number) => `${getCurrencySymbol(code)}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const first = PREFERRED_FIRST as readonly string[]
  const pickable = [...first.filter(c => draft.inUse.includes(c)), ...draft.inUse.filter(c => !first.includes(c)).sort()]
  const notInUse = ALL.filter(c => c !== data.base && !draft.inUse.includes(c))
  const set = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d))
  const toggleInUse = (code: string, on: boolean) => set({ inUse: on ? [...draft.inUse, code] : draft.inUse.filter(c => c !== code) })

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = {}
      if (changed.quote) body.default_quote_currency = draft.quoteCurrency === billing ? null : draft.quoteCurrency
      if (changed.buffer) body.conversion_buffer_percent = draft.buffer
      if (changed.inUse) body.currencies_in_use = draft.inUse
      if (changed.rates.length > 0) {
        const overrides: Record<string, number | null> = {}
        for (const c of changed.rates) {
          const v = draft.yourRate[c].trim()
          if (v === '') { overrides[c] = null; continue }
          const n = Number(v)
          if (!Number.isFinite(n) || n <= 0) throw new Error(`The rate for ${c} must be a number above 0`)
          overrides[c] = n
        }
        body.overrides = overrides
      }
      const res = await fetch('/api/settings/currencies', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.success) throw new Error(j.error || 'Could not save')
      await load()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const res = await fetch('/api/exchange-rates/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.success === false) throw new Error(j.error || 'Could not refresh the rates')
      setRefreshMsg(j.message || 'Rates refreshed.')
      // Keep what is being edited; take the new API rates and time.
      const fresh = await fetch('/api/settings/currencies').then(r => r.json()).catch(() => null)
      if (fresh?.success) setData(fresh.data)
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : 'Could not refresh the rates')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl">
      <SettingsCard>
        <SettingsRow label="Default quote currency" description="New quotes start in this currency. Staff can switch per quote.">
          <select
            value={draft.quoteCurrency}
            onChange={e => set({ quoteCurrency: e.target.value })}
            className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-[15px]"
            aria-label="Default quote currency"
          >
            {pickable.map(c => (
              <option key={c} value={c}>{c} — {currencyName(c)}</option>
            ))}
          </select>
          {billing !== data.base && (
            <p className="mt-2 text-xs text-gray-500">Your company bills in {billing} — {currencyName(billing)}.</p>
          )}
        </SettingsRow>

        <SettingsRow label="Conversion buffer" description="Protects you if the rate moves between quote and payment. Only what the client sees in another currency; never the amount charged.">
          <NumberStepper label="Conversion buffer" value={draft.buffer} max={20} onChange={v => set({ buffer: v })} />
          <Note>
            {draft.buffer === 0 ? (
              <>Off. Prices shown in another currency use the exchange rate as it is.</>
            ) : exampleRate ? (
              <>
                Example: a {fmt(billing, 1000)} quote shown in {exampleTo} reads{' '}
                <strong>{fmt(exampleTo, displayWithBuffer(1000, exampleRate, draft.buffer))}</strong> instead of{' '}
                {fmt(exampleTo, displayWithBuffer(1000, exampleRate, 0))}.
              </>
            ) : (
              <>Prices shown in another currency read {draft.buffer}% higher than the plain exchange rate.</>
            )}
          </Note>
        </SettingsRow>
      </SettingsCard>

      <section className="mt-6 bg-white border border-gray-200 rounded-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Exchange rates</h2>
            <p className="mt-1 text-sm text-gray-600">
              1 {data.base} = … · from ExchangeRate-API · updated {when(data.last_api_fetch)}
            </p>
            {refreshMsg && <p className="mt-1 text-xs text-gray-500">{refreshMsg}</p>}
          </div>
          <div className="flex gap-2">
            <div className="relative" ref={addRef}>
              <button
                type="button"
                onClick={() => setAdding(a => !a)}
                disabled={notInUse.length === 0}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                aria-haspopup="menu"
                aria-expanded={adding}
              >
                <Plus size={16} strokeWidth={1.7} aria-hidden /> Add currency
              </button>
              {adding && (
                <div role="menu" className="absolute right-0 mt-2 w-60 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-30">
                  {notInUse.map(c => (
                    <button
                      key={c}
                      type="button"
                      role="menuitem"
                      onClick={() => { toggleInUse(c, true); setAdding(false) }}
                      className="w-full text-left px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <strong>{c}</strong> {currencyName(c)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={16} strokeWidth={1.7} className={refreshing ? 'animate-spin' : ''} aria-hidden /> Refresh now
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3 w-16">In use</th>
                <th className="px-3 py-3">Currency</th>
                <th className="px-3 py-3 text-right">API rate</th>
                <th className="px-3 py-3 w-40">Your rate</th>
                <th className="px-3 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rates.map(r => {
                const typed = draft.yourRate[r.currency] ?? ''
                const edited = changed.rates.includes(r.currency)
                const custom = typed.trim() !== ''
                const inUse = draft.inUse.includes(r.currency)
                return (
                  <tr key={r.currency} className={inUse ? '' : 'text-gray-400'}>
                    <td className="px-5 py-2.5">
                      <input
                        type="checkbox"
                        checked={inUse}
                        onChange={e => toggleInUse(r.currency, e.target.checked)}
                        disabled={r.currency === draft.quoteCurrency && inUse}
                        aria-label={`${r.currency} in use`}
                        className="w-4 h-4 accent-primary-700"
                      />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-semibold text-gray-900">{r.currency}</span>{' '}
                      <span className={inUse ? 'text-gray-700' : ''}>{currencyName(r.currency)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.api_rate !== null ? rateText(r.api_rate) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={typed}
                        placeholder={r.api_rate !== null ? rateText(r.api_rate) : ''}
                        onChange={e => set({ yourRate: { ...draft.yourRate, [r.currency]: e.target.value } })}
                        aria-label={`Your rate for ${r.currency}`}
                        className={`w-36 h-9 px-3 text-right rounded-lg border tabular-nums ${
                          edited ? 'border-orange-400 bg-orange-50' : 'border-gray-200'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {custom ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold">Custom</span>
                          <span className="text-gray-500">
                            {edited ? 'Not saved yet' : `Set by ${r.override?.set_by ?? 'an admin'} on ${when(r.override?.set_at ?? null)}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => set({ yourRate: { ...draft.yourRate, [r.currency]: '' } })}
                            className="font-medium text-primary-800 underline"
                          >
                            Reset to API
                          </button>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-800 font-semibold">API</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 sm:px-6 py-4 text-xs text-gray-500 border-t border-gray-100">
          Unticked currencies stay in the table but don&rsquo;t appear in quote currency pickers. Every override and reset is logged.
        </p>
      </section>

      <SaveBar
        changes={changes}
        saving={saving}
        error={saveError}
        onDiscard={() => { setDraft(toDraft(data)); setSaveError(null) }}
        onSave={save}
      />
    </div>
  )
}
