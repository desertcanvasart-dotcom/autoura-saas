'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ExchangeRate,
  CurrencyCode,
  convertCurrency,
  formatCurrency,
  getCurrencySymbol,
  createCurrencyConverter,
  DEFAULT_RATES
} from '@/lib/currency'

interface UseCurrencyOptions {
  /**
   * The base currency for all rates in the system (usually EUR)
   */
  baseCurrency?: string
}

interface UseCurrencyReturn {
  /**
   * User's preferred currency
   */
  userCurrency: string
  /**
   * Set the user's preferred currency
   */
  setUserCurrency: (currency: string) => void
  /**
   * Exchange rates loaded from the API
   */
  exchangeRates: ExchangeRate[]
  /**
   * Whether rates are currently loading
   */
  loading: boolean
  /**
   * Any error that occurred
   */
  error: string | null
  /**
   * Convert an amount from base currency to user's preferred currency
   */
  convert: (amount: number, fromCurrency?: string) => number
  /**
   * Format a converted amount with currency symbol
   */
  format: (amount: number, fromCurrency?: string, options?: {
    showSymbol?: boolean
    decimals?: number
    compact?: boolean
  }) => string
  /**
   * Convert and format in one step
   */
  display: (amount: number, fromCurrency?: string) => string
  /**
   * Get the currency symbol for the user's currency
   */
  symbol: string
  /**
   * Get exchange rate from one currency to another
   */
  getRate: (fromCurrency: string, toCurrency?: string) => number | null
  /**
   * Refresh exchange rates from the API
   */
  refresh: () => Promise<void>
}

/**
 * Hook for currency conversion throughout the app
 *
 * Usage:
 * ```tsx
 * const { convert, format, display, symbol, userCurrency } = useCurrency()
 *
 * // Convert EUR amount to user's currency
 * const converted = convert(100) // 100 EUR -> user currency
 *
 * // Format with symbol
 * const formatted = format(100) // "$108.00" if user currency is USD
 *
 * // Quick display (convert + format)
 * const displayed = display(100) // "$108.00"
 *
 * // Just the symbol
 * <span>{symbol}{someValue}</span> // "$123"
 * ```
 */
export function useCurrency(options: UseCurrencyOptions = {}): UseCurrencyReturn {
  const { baseCurrency = 'EUR' } = options

  const [userCurrency, setUserCurrency] = useState<string>('EUR')
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch user preferences
  const fetchUserPreferences = useCallback(async () => {
    try {
      const response = await fetch('/api/user-preferences')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.default_currency) {
          setUserCurrency(data.data.default_currency)
        }
      }
    } catch (err) {
      console.error('Error fetching user preferences:', err)
    }
  }, [])

  // Fetch exchange rates
  const fetchExchangeRates = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/exchange-rates')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setExchangeRates(data.data)
        }
      }
    } catch (err) {
      console.error('Error fetching exchange rates:', err)
      setError('Failed to load exchange rates')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchUserPreferences()
    fetchExchangeRates()
  }, [fetchUserPreferences, fetchExchangeRates])

  // Create converter with current rates
  const converter = useMemo(() => {
    return createCurrencyConverter(exchangeRates, baseCurrency)
  }, [exchangeRates, baseCurrency])

  // Convert amount to user's currency
  const convert = useCallback((amount: number, fromCurrency?: string): number => {
    if (!amount || isNaN(amount)) return 0

    const from = fromCurrency || baseCurrency
    if (from === userCurrency) return amount

    return converter.convert(amount, userCurrency, from)
  }, [converter, userCurrency, baseCurrency])

  // Format amount in user's currency
  const format = useCallback((
    amount: number,
    fromCurrency?: string,
    options?: { showSymbol?: boolean; decimals?: number; compact?: boolean }
  ): string => {
    const converted = convert(amount, fromCurrency)
    return formatCurrency(converted, userCurrency, options)
  }, [convert, userCurrency])

  // Quick display function
  const display = useCallback((amount: number, fromCurrency?: string): string => {
    return format(amount, fromCurrency)
  }, [format])

  // Get exchange rate
  const getRate = useCallback((fromCurrency: string, toCurrency?: string): number | null => {
    const to = toCurrency || userCurrency
    return converter.getRate(to, fromCurrency)
  }, [converter, userCurrency])

  // Refresh rates
  const refresh = useCallback(async () => {
    await fetchExchangeRates()
  }, [fetchExchangeRates])

  return {
    userCurrency,
    setUserCurrency,
    exchangeRates,
    loading,
    error,
    convert,
    format,
    display,
    symbol: getCurrencySymbol(userCurrency),
    getRate,
    refresh
  }
}

/**
 * Simplified hook that just returns conversion utilities
 * without fetching - useful when you already have rates
 */
export function useCurrencyConverter(
  rates: ExchangeRate[],
  userCurrency: string,
  baseCurrency: string = 'EUR'
) {
  const converter = useMemo(() => {
    return createCurrencyConverter(rates, baseCurrency)
  }, [rates, baseCurrency])

  const convert = useCallback((amount: number, fromCurrency?: string): number => {
    if (!amount || isNaN(amount)) return 0
    const from = fromCurrency || baseCurrency
    if (from === userCurrency) return amount
    return converter.convert(amount, userCurrency, from)
  }, [converter, userCurrency, baseCurrency])

  const format = useCallback((amount: number, fromCurrency?: string): string => {
    const converted = convert(amount, fromCurrency)
    return formatCurrency(converted, userCurrency)
  }, [convert, userCurrency])

  return {
    convert,
    format,
    symbol: getCurrencySymbol(userCurrency)
  }
}

export default useCurrency
