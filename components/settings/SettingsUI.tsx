'use client'

import { useEffect, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

// The Settings area's building blocks: a card of rows (label and description
// on the left, the control on the right, stacked below 720px), a segmented
// control, a number field with − / + and ONE save model — a sticky bar that
// appears only while the page has unsaved changes, and a warning before
// leaving with them.

export function SettingsCard({ children }: { children: ReactNode }) {
  return <section className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-200">{children}</section>
}

export function SettingsRow({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col min-[720px]:flex-row min-[720px]:items-start gap-3 min-[720px]:gap-8 p-5 sm:p-6">
      <div className="min-[720px]:w-[44%] min-w-0">
        <p className="text-[15px] font-semibold text-gray-900">{label}</p>
        {description && <div className="mt-1 text-sm text-gray-600">{description}</div>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full p-1 rounded-lg border border-gray-200 bg-white">
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`flex-1 min-w-0 truncate px-2 py-2 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed ${
              on ? 'bg-primary-700 text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function NumberStepper({
  value,
  onChange,
  step = 0.5,
  min = 0,
  max,
  suffix = '%',
  label,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max: number
  suffix?: string
  label: string
  disabled?: boolean
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step))
  const btn = 'w-11 h-11 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40'
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(clamp(value - step))} disabled={disabled || value <= min} aria-label={`Decrease ${label}`}>
        <Minus size={16} strokeWidth={1.7} />
      </button>
      <label className="relative">
        <span className="sr-only">{label}</span>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ''}
          disabled={disabled}
          onChange={e => {
            const n = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
          }}
          className="w-28 h-11 pl-3 pr-8 text-right text-[15px] font-medium rounded-lg border border-gray-200 tabular-nums"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">{suffix}</span>
      </label>
      <button type="button" className={btn} onClick={() => onChange(clamp(value + step))} disabled={disabled || value >= max} aria-label={`Increase ${label}`}>
        <Plus size={16} strokeWidth={1.7} />
      </button>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="mt-3 p-4 rounded-lg bg-gray-50 text-sm text-gray-700 leading-relaxed">{children}</div>
}

/**
 * Warns before the page is left with unsaved changes: closing or reloading
 * the tab, and in-app links (the Settings sidebar, Back to app).
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank') return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return
      if (!window.confirm('You have unsaved changes. Leave without saving?')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])
}

export function SaveBar({
  changes,
  saving,
  onDiscard,
  onSave,
  error,
}: {
  changes: number
  saving: boolean
  onDiscard: () => void
  onSave: () => void
  error?: string | null
}) {
  if (changes === 0 && !error) return null
  return (
    <div className="sticky bottom-4 z-20 mt-6">
      <div
        role="region"
        aria-label="Unsaved changes"
        className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5 rounded-xl bg-gray-900 text-white shadow-xl"
      >
        <p className="text-sm flex-1">
          {error ? <span className="text-red-300">{error}</span> : `${changes} unsaved change${changes === 1 ? '' : 's'}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="h-10 px-4 rounded-lg border border-white/30 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || changes === 0}
            className="h-10 px-4 rounded-lg bg-primary-300 text-gray-900 text-sm font-semibold hover:bg-primary-200 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
