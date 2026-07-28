import { describe, it, expect, vi } from 'vitest'
import { getCatalogScope, catalogOrExpr, CATALOG_TABLES } from '@/lib/catalog-scope'

function clientReturning(result: {
  data: { use_global_catalog?: boolean } | null
  error: { message: string } | null
}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  }
}

describe('catalogOrExpr', () => {
  it('merges the global catalog when the flag is on', () => {
    expect(catalogOrExpr({ tenantId: 't1', useGlobalCatalog: true })).toBe(
      'tenant_id.eq.t1,tenant_id.is.null'
    )
  })

  it('is a plain tenant filter when the flag is off', () => {
    expect(catalogOrExpr({ tenantId: 't1', useGlobalCatalog: false })).toBe('tenant_id.eq.t1')
  })
})

describe('getCatalogScope', () => {
  it('reads the tenant flag', async () => {
    const scope = await getCatalogScope(
      clientReturning({ data: { use_global_catalog: false }, error: null }),
      't1'
    )
    expect(scope).toEqual({ tenantId: 't1', useGlobalCatalog: false })
  })

  it('defaults to shared catalog when the tenant has no tenant_features row', async () => {
    const scope = await getCatalogScope(clientReturning({ data: null, error: null }), 't1')
    expect(scope.useGlobalCatalog).toBe(true)
  })

  it('defaults to shared catalog when the lookup errors (rates must not vanish)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const scope = await getCatalogScope(
      clientReturning({ data: null, error: { message: 'boom' } }),
      't1'
    )
    expect(scope.useGlobalCatalog).toBe(true)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('CATALOG_TABLES', () => {
  it('is exactly the seven migration-seeded catalog tables', () => {
    expect([...CATALOG_TABLES].sort()).toEqual(
      [
        'airport_staff_rates',
        'entrance_fees',
        'flight_rates',
        'hotel_staff_rates',
        'sleeping_train_rates',
        'tipping_rates',
        'train_rates',
      ].sort()
    )
  })
})
