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
