'use client'

import { useCurrency } from '@/hooks/useCurrency'
import { formatCurrency, getCurrencySymbol } from '@/lib/currency'

interface CurrencyDisplayProps {
  /**
   * The amount to display (in base currency, usually EUR)
   */
  amount: number
  /**
   * The currency the amount is currently in (defaults to EUR)
   */
  fromCurrency?: string
  /**
   * Whether to show the currency symbol
   */
  showSymbol?: boolean
  /**
   * Number of decimal places
   */
  decimals?: number
  /**
   * Use compact notation for large numbers
   */
  compact?: boolean
  /**
   * Additional CSS classes
   */
  className?: string
  /**
   * If true, shows original value in parentheses when converted
   */
  showOriginal?: boolean
}

/**
 * Component for displaying currency values with automatic conversion
 *
 * Usage:
 * ```tsx
 * // Simple usage - converts EUR to user's preferred currency
 * <CurrencyDisplay amount={100} />
 *
 * // With options
 * <CurrencyDisplay amount={100} decimals={0} compact />
 *
 * // Show original value too
 * <CurrencyDisplay amount={100} showOriginal />
 * ```
 */
export function CurrencyDisplay({
  amount,
  fromCurrency = 'EUR',
  showSymbol = true,
  decimals = 2,
  compact = false,
  className = '',
  showOriginal = false
}: CurrencyDisplayProps) {
  const { convert, userCurrency, symbol, loading } = useCurrency()

  if (loading) {
    return <span className={className}>...</span>
  }

  if (!amount && amount !== 0) {
    return <span className={className}>-</span>
  }

  const converted = convert(amount, fromCurrency)
  const formatted = formatCurrency(converted, userCurrency, {
    showSymbol,
    decimals,
    compact
  })

  if (showOriginal && fromCurrency !== userCurrency) {
    const originalFormatted = formatCurrency(amount, fromCurrency, {
      showSymbol: true,
      decimals,
      compact
    })
    return (
      <span className={className}>
        {formatted}
        <span className="text-gray-400 text-xs ml-1">({originalFormatted})</span>
      </span>
    )
  }

  return <span className={className}>{formatted}</span>
}

/**
 * Just the currency symbol for the user's preferred currency
 */
export function CurrencySymbol({ className = '' }: { className?: string }) {
  const { symbol, loading } = useCurrency()

  if (loading) return <span className={className}>...</span>
  return <span className={className}>{symbol}</span>
}

/**
 * Currency input prefix that shows the correct symbol
 */
export function CurrencyInputPrefix({ className = '' }: { className?: string }) {
  const { symbol, loading } = useCurrency()

  if (loading) {
    return <span className={`${className} text-gray-400`}>$</span>
  }

  return <span className={`${className} text-gray-400`}>{symbol}</span>
}

/**
 * Hook to get just the currency info for manual formatting
 */
export function useCurrencyInfo() {
  const { userCurrency, symbol, convert, format, loading, exchangeRates, getRate } = useCurrency()

  return {
    currency: userCurrency,
    symbol,
    convert,
    format,
    loading,
    exchangeRates,
    getRate
  }
}

export default CurrencyDisplay
