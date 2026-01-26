/**
 * Currency Exchange Rate API Service
 *
 * Uses ExchangeRate-API (https://www.exchangerate-api.com/)
 * Free tier: 1,500 requests/month
 *
 * This service fetches real-time exchange rates and caches them in the database.
 * Rates are shared across all tenants (system-level) but tenants can override
 * with custom rates if needed.
 */

const API_BASE_URL = 'https://v6.exchangerate-api.com/v6'
const BASE_CURRENCY = 'EUR' // Our system stores all rates in EUR

export interface ExchangeRateAPIResponse {
  result: 'success' | 'error'
  documentation?: string
  terms_of_use?: string
  time_last_update_unix?: number
  time_last_update_utc?: string
  time_next_update_unix?: number
  time_next_update_utc?: string
  base_code?: string
  conversion_rates?: Record<string, number>
  'error-type'?: string
}

export interface FetchedRate {
  base_currency: string
  target_currency: string
  rate: number
  fetched_at: Date
}

// Supported currencies in our system
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'EGP'] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

/**
 * Fetch exchange rates from ExchangeRate-API
 *
 * @param apiKey - Optional API key. If not provided, uses free "open" endpoint
 * @param baseCurrency - Base currency to fetch rates for (default: EUR)
 * @returns Array of exchange rates
 */
export async function fetchExchangeRates(
  apiKey?: string,
  baseCurrency: string = BASE_CURRENCY
): Promise<FetchedRate[]> {
  try {
    // Use free endpoint if no API key provided
    const url = apiKey
      ? `${API_BASE_URL}/${apiKey}/latest/${baseCurrency}`
      : `https://open.er-api.com/v6/latest/${baseCurrency}`

    const response = await fetch(url, {
      next: { revalidate: 3600 } // Cache for 1 hour in Next.js
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data: ExchangeRateAPIResponse = await response.json()

    if (data.result !== 'success') {
      throw new Error(`API error: ${data['error-type'] || 'Unknown error'}`)
    }

    if (!data.conversion_rates) {
      throw new Error('No conversion rates in API response')
    }

    const fetchedAt = new Date()
    const rates: FetchedRate[] = []

    // Extract only the currencies we support
    for (const currency of SUPPORTED_CURRENCIES) {
      if (currency === baseCurrency) continue // Skip base currency

      const rate = data.conversion_rates[currency]
      if (rate !== undefined) {
        rates.push({
          base_currency: baseCurrency,
          target_currency: currency,
          rate,
          fetched_at: fetchedAt
        })
      }
    }

    return rates
  } catch (error) {
    console.error('Error fetching exchange rates:', error)
    throw error
  }
}

/**
 * Fetch rates for all base currencies we need
 * This gives us EUR -> USD, USD -> EUR, etc.
 */
export async function fetchAllExchangeRates(apiKey?: string): Promise<FetchedRate[]> {
  const allRates: FetchedRate[] = []

  // Fetch EUR-based rates (primary)
  const eurRates = await fetchExchangeRates(apiKey, 'EUR')
  allRates.push(...eurRates)

  // Calculate reverse rates from EUR rates for efficiency
  // Instead of making multiple API calls
  for (const rate of eurRates) {
    // Add reverse rate (e.g., USD -> EUR)
    allRates.push({
      base_currency: rate.target_currency,
      target_currency: 'EUR',
      rate: 1 / rate.rate,
      fetched_at: rate.fetched_at
    })
  }

  return allRates
}

/**
 * Format a rate for display
 */
export function formatExchangeRate(rate: number): string {
  if (rate >= 100) {
    return rate.toFixed(2)
  } else if (rate >= 1) {
    return rate.toFixed(4)
  } else {
    return rate.toFixed(6)
  }
}

/**
 * Get the last update time as a human-readable string
 */
export function getLastUpdateDisplay(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
}

/**
 * Check if rates need to be refreshed (older than specified hours)
 */
export function ratesNeedRefresh(lastUpdate: Date, maxAgeHours: number = 24): boolean {
  const now = new Date()
  const diffMs = now.getTime() - lastUpdate.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  return diffHours >= maxAgeHours
}
