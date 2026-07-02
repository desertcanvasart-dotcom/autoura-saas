// ============================================
// CURRENCY EXCHANGE SERVICE
// ============================================
// Uses ExchangeRate-API's open endpoint for real-time exchange rates
// (https://open.er-api.com — free, no key). Chosen over Frankfurter/ECB
// because ECB does not publish EGP, which this product needs.

export interface ExchangeRates {
  base: string
  date: string
  rates: Record<string, number>
}

// Supported currencies
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP'] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

// Currency symbols
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  EGP: 'E£'
}

// Cache for exchange rates (in-memory, refreshes on server restart)
let cachedRates: ExchangeRates | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

// Track whether we're using fallback rates
let usingFallback = false
export function isUsingFallbackRates(): boolean { return usingFallback }

/**
 * Fetch latest exchange rates from ExchangeRate-API's open endpoint.
 * Unlike Frankfurter (ECB), this source carries EGP.
 */
export async function fetchExchangeRates(baseCurrency: string = 'USD'): Promise<ExchangeRates> {
  // Check cache first
  const now = Date.now()
  if (cachedRates && cachedRates.base === baseCurrency && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRates
  }

  try {
    // ExchangeRate-API open endpoint - free, no API key required
    const response = await fetch(
      `https://open.er-api.com/v6/latest/${baseCurrency}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour in Next.js
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.result !== 'success' || !data.rates) {
      throw new Error(`Exchange rate API error: ${data['error-type'] || 'no rates in response'}`)
    }

    // Base currency is included with rate 1 in er-api responses; keep it
    // explicit anyway for shape parity.
    const rates: ExchangeRates = {
      base: data.base_code,
      date: (data.time_last_update_utc
        ? new Date(data.time_last_update_utc).toISOString()
        : new Date().toISOString()).split('T')[0],
      rates: {
        [data.base_code]: 1,
        ...data.rates
      }
    }

    // Update cache
    cachedRates = rates
    cacheTimestamp = now
    usingFallback = false

    return rates
  } catch (error) {
    console.error('⚠️ Error fetching exchange rates — using fallback:', error)

    // Return fallback rates if API fails
    usingFallback = true
    return getFallbackRates(baseCurrency)
  }
}

/**
 * Fallback rates in case API is unavailable.
 * Based on ECB rates as of February 2026.
 * EUR is the reference base since all our rates are stored in EUR.
 *
 * IMPORTANT: Update these periodically to stay accurate.
 * Last updated: 2026-02-22
 * Source: ECB reference rates via Frankfurter API
 */
export function getFallbackRates(baseCurrency: string): ExchangeRates {
  // EUR-based rates as of Feb 22, 2026 (ECB reference)
  const eurRates: Record<string, number> = {
    EUR: 1,
    USD: 1.1782,
    GBP: 0.8737,
    EGP: 56.00
  }

  if (baseCurrency === 'EUR') {
    return {
      base: 'EUR',
      date: new Date().toISOString().split('T')[0],
      rates: eurRates
    }
  }

  // Convert rates to different base
  const baseRateInEur = eurRates[baseCurrency] || 1
  const convertedRates: Record<string, number> = {}

  for (const [currency, eurRate] of Object.entries(eurRates)) {
    convertedRates[currency] = eurRate / baseRateInEur
  }

  return {
    base: baseCurrency,
    date: new Date().toISOString().split('T')[0],
    rates: convertedRates
  }
}

/**
 * Convert amount from one currency to another.
 *
 * Returns null when no rate is available. NEVER returns the unconverted
 * amount — rendering 1000 EGP as €1,000 is a ~53× error. Callers must
 * handle null (show the original amount with its ORIGINAL currency symbol,
 * or a placeholder).
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates
): number | null {
  if (fromCurrency === toCurrency) {
    return amount
  }

  // If the rates are based on the source currency
  if (rates.base === fromCurrency) {
    const rate = rates.rates[toCurrency]
    if (rate) {
      return amount * rate
    }
  }

  // If the rates are based on the target currency
  if (rates.base === toCurrency) {
    const rate = rates.rates[fromCurrency]
    if (rate) {
      return amount / rate
    }
  }

  // Cross conversion through base currency
  const fromRate = rates.rates[fromCurrency]
  const toRate = rates.rates[toCurrency]

  if (fromRate && toRate) {
    // Convert: amount in fromCurrency -> base -> toCurrency
    const amountInBase = amount / fromRate
    return amountInBase * toRate
  }

  console.warn(`Could not convert ${fromCurrency} to ${toCurrency}`)
  return null
}

/**
 * Format currency amount with symbol
 */
export function formatCurrency(
  amount: number,
  currency: string,
  options?: {
    showSymbol?: boolean
    decimals?: number
  }
): string {
  const { showSymbol = true, decimals = 2 } = options || {}

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })

  if (showSymbol) {
    const symbol = CURRENCY_SYMBOLS[currency] || currency
    return `${symbol}${formatted}`
  }

  return formatted
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency
}

// ============================================
// EXCHANGE RATE PERSISTENCE
// ============================================

/**
 * Persist an exchange rate snapshot to the database.
 * Called during service creation to record the rate used for a conversion.
 */
export async function persistExchangeRate(
  supabase: any,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  source: string = 'frankfurter'
): Promise<void> {
  try {
    await supabase.from('exchange_rate_snapshots').insert({
      base_currency: fromCurrency,
      target_currency: toCurrency,
      rate,
      source,
    })
  } catch (error) {
    console.warn('⚠️ Failed to persist exchange rate snapshot:', error)
  }
}

/**
 * Get the most recent historical exchange rate for a currency pair.
 * Useful for auditing and reports — looks up saved snapshots.
 */
export async function getHistoricalRate(
  supabase: any,
  fromCurrency: string,
  toCurrency: string,
  date?: Date
): Promise<{ rate: number; capturedAt: string; source: string } | null> {
  try {
    let query = supabase
      .from('exchange_rate_snapshots')
      .select('rate, captured_at, source')
      .eq('base_currency', fromCurrency)
      .eq('target_currency', toCurrency)
      .order('captured_at', { ascending: false })
      .limit(1)

    if (date) {
      // Find the closest snapshot on or before the given date
      query = query.lte('captured_at', date.toISOString())
    }

    const { data, error } = await query

    if (error || !data?.length) return null

    return {
      rate: data[0].rate,
      capturedAt: data[0].captured_at,
      source: data[0].source,
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch historical exchange rate:', error)
    return null
  }
}

/**
 * Get exchange rate between two currencies.
 * Convenience function for getting a single rate value.
 */
export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates
): number | null {
  if (fromCurrency === toCurrency) return 1

  if (rates.base === fromCurrency) {
    return rates.rates[toCurrency] || null
  }

  if (rates.base === toCurrency) {
    const rate = rates.rates[fromCurrency]
    return rate ? 1 / rate : null
  }

  // Cross rate through base
  const fromRate = rates.rates[fromCurrency]
  const toRate = rates.rates[toCurrency]
  if (fromRate && toRate) {
    return toRate / fromRate
  }

  return null
}
