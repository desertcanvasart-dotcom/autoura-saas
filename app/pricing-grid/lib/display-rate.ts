// ============================================
// The Quote Builder's display currency
// ============================================
// The grid prices in the tenant's run currency (the rates' own); Currency is
// how the prices are SHOWN. The page read `data.rates` from
// /api/exchange-rates, which answers a list — so no rate was ever found, and
// switching to USD put a $ on euro amounts. It also assumed the base was EUR.
// Pure: the page and the tests share it.

import { getExchangeRate, type ExchangeRate } from '@/lib/currency'

export type DisplayRate =
  | { ok: true; rate: number | null }   // null: the run currency itself
  | { ok: false; reason: string }

export function displayRate(runCurrency: string, currency: string, rates: ExchangeRate[] | null): DisplayRate {
  if (currency === runCurrency) return { ok: true, rate: null }
  if (!rates) return { ok: false, reason: 'loading' }
  const rate = getExchangeRate(runCurrency, currency, rates)
  if (rate && Number.isFinite(rate) && rate > 0) return { ok: true, rate }
  return { ok: false, reason: `No exchange rate from ${runCurrency} to ${currency} — add one in Settings → Exchange Rates. Prices are shown in ${runCurrency}.` }
}
