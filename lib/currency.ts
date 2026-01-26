/**
 * Currency conversion utilities
 *
 * This module provides functions for converting between currencies
 * and formatting currency values for display.
 */

export interface ExchangeRate {
  id: string
  tenant_id: string
  base_currency: string
  target_currency: string
  rate: number
  is_active: boolean
  last_updated_at: string
}

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'EGP'

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  EGP: 'E£'
}

export const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  EUR: 'Euro',
  USD: 'US Dollar',
  GBP: 'British Pound',
  EGP: 'Egyptian Pound'
}

// Default fallback rates (EUR as base)
// These are used only if database rates aren't available
export const DEFAULT_RATES: Record<string, number> = {
  'EUR_USD': 1.08,
  'EUR_GBP': 0.86,
  'EUR_EGP': 53.50,
  'USD_EUR': 0.926,
  'USD_GBP': 0.796,
  'USD_EGP': 49.54,
  'GBP_EUR': 1.163,
  'GBP_USD': 1.256,
  'GBP_EGP': 62.21,
  'EGP_EUR': 0.0187,
  'EGP_USD': 0.0202,
  'EGP_GBP': 0.0161,
}

/**
 * Get the currency symbol for a currency code
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency as CurrencyCode] || currency
}

/**
 * Get the currency name for a currency code
 */
export function getCurrencyName(currency: string): string {
  return CURRENCY_NAMES[currency as CurrencyCode] || currency
}

/**
 * Convert an amount from one currency to another using provided rates
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRate[]
): number {
  if (fromCurrency === toCurrency) {
    return amount
  }

  // Try to find direct conversion rate
  const directRate = rates.find(
    r => r.base_currency === fromCurrency && r.target_currency === toCurrency && r.is_active
  )

  if (directRate) {
    return amount * directRate.rate
  }

  // Try reverse rate
  const reverseRate = rates.find(
    r => r.base_currency === toCurrency && r.target_currency === fromCurrency && r.is_active
  )

  if (reverseRate) {
    return amount / reverseRate.rate
  }

  // Fall back to default rates
  const fallbackKey = `${fromCurrency}_${toCurrency}`
  if (DEFAULT_RATES[fallbackKey]) {
    return amount * DEFAULT_RATES[fallbackKey]
  }

  // If no rate found, return original amount
  console.warn(`No exchange rate found for ${fromCurrency} to ${toCurrency}`)
  return amount
}

/**
 * Convert an amount using a simple rate lookup (for client-side use)
 */
export function convertWithRate(
  amount: number,
  rate: number
): number {
  return amount * rate
}

/**
 * Format a currency value for display
 */
export function formatCurrency(
  amount: number,
  currency: string,
  options?: {
    showSymbol?: boolean
    decimals?: number
    compact?: boolean
  }
): string {
  const { showSymbol = true, decimals = 2, compact = false } = options || {}

  const symbol = showSymbol ? getCurrencySymbol(currency) : ''

  if (compact && amount >= 1000) {
    const formatted = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(amount)
    return `${symbol}${formatted}`
  }

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount)

  return `${symbol}${formatted}`
}

/**
 * Format a currency value with the currency code
 */
export function formatCurrencyWithCode(
  amount: number,
  currency: string,
  decimals: number = 2
): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount)

  return `${formatted} ${currency}`
}

/**
 * Get exchange rate between two currencies from rates array
 */
export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRate[]
): number | null {
  if (fromCurrency === toCurrency) {
    return 1
  }

  // Try direct rate
  const directRate = rates.find(
    r => r.base_currency === fromCurrency && r.target_currency === toCurrency && r.is_active
  )

  if (directRate) {
    return directRate.rate
  }

  // Try reverse rate
  const reverseRate = rates.find(
    r => r.base_currency === toCurrency && r.target_currency === fromCurrency && r.is_active
  )

  if (reverseRate) {
    return 1 / reverseRate.rate
  }

  // Fallback
  const fallbackKey = `${fromCurrency}_${toCurrency}`
  return DEFAULT_RATES[fallbackKey] || null
}

/**
 * Create a currency converter function with pre-loaded rates
 * Useful for converting multiple values without passing rates each time
 */
export function createCurrencyConverter(
  rates: ExchangeRate[],
  defaultFromCurrency: string = 'EUR'
) {
  return {
    convert: (amount: number, toCurrency: string, fromCurrency?: string) => {
      return convertCurrency(
        amount,
        fromCurrency || defaultFromCurrency,
        toCurrency,
        rates
      )
    },
    format: (amount: number, currency: string, options?: Parameters<typeof formatCurrency>[2]) => {
      return formatCurrency(amount, currency, options)
    },
    convertAndFormat: (
      amount: number,
      toCurrency: string,
      fromCurrency?: string,
      formatOptions?: Parameters<typeof formatCurrency>[2]
    ) => {
      const converted = convertCurrency(
        amount,
        fromCurrency || defaultFromCurrency,
        toCurrency,
        rates
      )
      return formatCurrency(converted, toCurrency, formatOptions)
    },
    getRate: (toCurrency: string, fromCurrency?: string) => {
      return getExchangeRate(fromCurrency || defaultFromCurrency, toCurrency, rates)
    }
  }
}

/**
 * Hook-friendly function to batch convert multiple values
 */
export function batchConvert(
  values: Record<string, number>,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRate[]
): Record<string, number> {
  const result: Record<string, number> = {}

  for (const [key, value] of Object.entries(values)) {
    result[key] = convertCurrency(value, fromCurrency, toCurrency, rates)
  }

  return result
}
