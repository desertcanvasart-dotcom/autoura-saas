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
 * Convert an amount from one currency to another using provided rates.
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
  rates: ExchangeRate[]
): number | null {
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

  // Cross rate via EUR legs: the exchange_rates table stores only EUR↔X
  // pairs, so e.g. EGP→USD is EGP→EUR→USD (C3.4 — non-EUR run currencies).
  if (fromCurrency !== 'EUR' && toCurrency !== 'EUR') {
    const toEur = convertCurrency(amount, fromCurrency, 'EUR', rates)
    if (toEur !== null) {
      const crossed = convertCurrency(toEur, 'EUR', toCurrency, rates)
      if (crossed !== null) return crossed
    }
  }

  console.warn(`No exchange rate found for ${fromCurrency} to ${toCurrency}`)
  return null
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

  if (compact && Math.abs(amount) >= 1000) {
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

  return null
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
      // No rate: show the amount honestly in its ORIGINAL currency rather
      // than mislabeling it with the target symbol.
      if (converted === null) {
        return formatCurrency(amount, fromCurrency || defaultFromCurrency, formatOptions)
      }
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
): Record<string, number | null> {
  const result: Record<string, number | null> = {}

  for (const [key, value] of Object.entries(values)) {
    result[key] = convertCurrency(value, fromCurrency, toCurrency, rates)
  }

  return result
}
