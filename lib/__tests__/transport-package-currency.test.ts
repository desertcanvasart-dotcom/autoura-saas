// A transport package is priced in its own currency, like every other rate
// (rate_currency, migration 295). The engine has converted a package's
// vehicle rates since 381; the form and its routes never let one be set.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import type { ExchangeRate } from '@/lib/currency'

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

describe('the transport package form', () => {
  const page = read('app', 'b2b', 'pricing-rules', 'page.tsx')
  it('offers the shared currency picker and sends the choice', () => {
    expect(page).toMatch(/<RateCurrencyField value=\{rateCurrency\} onChange=\{setRateCurrency\}/)
    expect(page).toMatch(/\.\.\.rateCurrencyPatch\(rateCurrency, editingPackage\?\.rate_currency\)/)
  })
  it('loads a package\'s own currency for editing, and starts a new one blank', () => {
    expect(page).toMatch(/setRateCurrency\(pkg\.rate_currency \|\| ''\)/)
    expect(page).toMatch(/setEditingPackage\(null\)\s+setRateCurrency\(''\)/)
  })
  it('shows each package in its own symbol, not the agency\'s', () => {
    expect(page).toMatch(/\{symbolFor\(pkg\.rate_currency\)\}\{v\.rate\}/)
    expect(page).not.toMatch(/\{currencySymbol\}\{v\.rate\}/)
  })
})

describe('the transport package routes', () => {
  it('create and update both store the currency', () => {
    expect(read('app', 'api', 'b2b', 'transport-packages', 'route.ts')).toMatch(/\.insert\(\{[\s\S]*?\.\.\.rateCurrencyWriteField\(body\)/)
    expect(read('app', 'api', 'b2b', 'transport-packages', '[id]', 'route.ts')).toMatch(/Object\.assign\(update, rateCurrencyWriteField\(body\)\)[\s\S]*?\.update\(update\)/)
  })
})

describe('pricing', () => {
  it('converts a package\'s vehicle rates from its own currency, and leaves the stored row alone', () => {
    const FX = [{ base_currency: 'EUR', target_currency: 'USD', rate: 2, is_active: true } as ExchangeRate]
    const { normalize } = createRateNormalizer(FX)
    const stored = { id: 'p', rate_currency: 'USD', vehicles: [{ vehicle_type: 'sedan', rate: 100 }] }
    const [out] = normalize('b2b_transport_packages', [stored as never]) as Array<{ vehicles: Array<{ vehicle_type: string; rate: number }> }>
    expect(out.vehicles).toEqual([{ vehicle_type: 'sedan', rate: 50 }])
    expect(stored.vehicles[0].rate).toBe(100)
  })
  it('a package in a currency with no exchange rate is a gap, never its raw number', () => {
    const { normalize } = createRateNormalizer([])
    const [out] = normalize('b2b_transport_packages', [{ id: 'p', rate_currency: 'USD', vehicles: [{ vehicle_type: 'sedan', rate: 100 }] } as never]) as Array<{ vehicles: unknown }>
    expect(out.vehicles).toBeNull()
  })
})
