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

// bufferPercent: the company's conversion buffer (Settings › Currencies,
// migration 456) — prices SHOWN in another currency read that much higher.
// Display only: the grid prices and saves in the run currency, and the shown
// figure is never charged.
export function displayRate(runCurrency: string, currency: string, rates: ExchangeRate[] | null, bufferPercent = 0): DisplayRate {
  if (currency === runCurrency) return { ok: true, rate: null }
  if (!rates) return { ok: false, reason: 'loading' }
  const rate = getExchangeRate(runCurrency, currency, rates)
  const buffer = Number.isFinite(bufferPercent) && bufferPercent > 0 ? bufferPercent : 0
  if (rate && Number.isFinite(rate) && rate > 0) return { ok: true, rate: rate * (1 + buffer / 100) }
  return { ok: false, reason: `No exchange rate from ${runCurrency} to ${currency} — add one in Settings → Currencies & rates. Prices are shown in ${runCurrency}.` }
}
