'use client'

// ============================================
// The symbol a rate's amounts are actually in (C3.4b)
// ============================================
// Rate columns are named *_eur, but since C3.4 the NAME is historical: what a
// column holds is the tenant's rates currency (tenants.rates_currency,
// migration 298), and an individual rate may override it (rate_currency,
// migration 295). A label reading "(€)" on a USD tenant's rate is therefore
// no longer merely untidy — it states the wrong currency for the number
// beside it.
//
// Precedence mirrors the engine's: the rate's own currency, else the
// tenant's, else EUR — the historical default that every existing row still
// means.

import { useCallback } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import { getCurrencySymbol } from '@/lib/currency'

export function useRateCurrency(rateCurrency?: string | null): {
  code: string
  symbol: string
} {
  const { tenant } = useTenant()
  const tenantCurrency = (tenant as { rates_currency?: string | null } | null)?.rates_currency
  const code = rateCurrency || tenantCurrency || 'EUR'
  return { code, symbol: getCurrencySymbol(code) }
}

/**
 * Format a rate AMOUNT in the currency that amount is actually in.
 *
 * The tables did the opposite of what the note above describes: they ran every
 * row through `convert()` with no source currency, so a row stored as 500 EGP
 * was treated as 500 of the base currency and multiplied by an FX rate before
 * display. The number on screen was in no currency at all — not the one it was
 * entered in, not the one the viewer picked (operator, 1 Sep).
 *
 * A rates table shows what the operator TYPED, so nothing here converts. The
 * row's own currency wins, else the tenant's, else EUR — the same precedence
 * the engine uses. Conversion still belongs on quotes and invoices, where the
 * source currency is passed explicitly.
 */
export function useRateRowFormat(): {
  fmtRate: (
    amount: number | null | undefined,
    row?: { rate_currency?: string | null } | null,
    decimals?: number
  ) => string
  fmtAverage: (
    average: { amount: number; currency: string | null } | null,
    decimals?: number
  ) => string
} {
  const { tenant } = useTenant()
  const tenantCurrency = (tenant as { rates_currency?: string | null } | null)?.rates_currency

  const fmtRate = useCallback(
    (
      amount: number | null | undefined,
      row?: { rate_currency?: string | null } | null,
      decimals = 2
    ) => {
      const code = row?.rate_currency || tenantCurrency || 'EUR'
      const n = Number(amount ?? 0)
      return `${getCurrencySymbol(code)}${n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`
    },
    [tenantCurrency]
  )

  // A null average means "these rows are in different currencies" — see
  // averageRateInOneCurrency. A dash is the honest render; there is no single
  // number to show and inventing one is the bug this replaced.
  const fmtAverage = useCallback(
    (average: { amount: number; currency: string | null } | null, decimals = 0) =>
      average === null
        ? '\u2014'
        : fmtRate(average.amount, { rate_currency: average.currency }, decimals),
    [fmtRate]
  )

  return { fmtRate, fmtAverage }
}
