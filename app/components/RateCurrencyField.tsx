'use client'

// ============================================
// Per-rate currency — the shared form field (P3)
// ============================================
// One selector for every rate form: which currency THIS rate's amounts are
// stored in. Empty selection = the system default (EUR) — exactly what every
// pre-migration row means. The pricing engine converts a copy at the fetch
// boundary (lib/rates/rate-currency.ts); the stored amounts never change.

import { SUPPORTED_CURRENCIES } from '@/lib/currency'

export const RATE_CURRENCIES = SUPPORTED_CURRENCIES

/**
 * Build the save-payload fragment. The key is included ONLY when the user
 * picked a currency or is clearing one that was loaded — so a form running
 * against a database without migration 295 sends nothing new at all
 * (deploy-order safety).
 */
export function rateCurrencyPatch(
  selected: string | null | undefined,
  loaded: string | null | undefined
): { rate_currency?: string | null } {
  const sel = selected || null
  const had = loaded || null
  if (sel === null && had === null) return {}
  return { rate_currency: sel }
}

/** Small badge for list rows priced in a non-default currency. */
export function rateCurrencyBadge(currency: string | null | undefined): string | null {
  return currency && currency !== 'EUR' ? currency : null
}

interface RateCurrencyFieldProps {
  value: string
  onChange: (value: string) => void
  className?: string
  compact?: boolean
}

export default function RateCurrencyField({ value, onChange, className, compact }: RateCurrencyFieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        Rate currency
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-transparent bg-white"
      >
        <option value="">EUR (default)</option>
        {RATE_CURRENCIES.filter(c => c !== 'EUR').map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {!compact && (
        <p className="mt-1 text-xs text-gray-400">
          The currency these amounts are entered in. Stored as entered; pricing converts automatically.
        </p>
      )}
    </div>
  )
}
