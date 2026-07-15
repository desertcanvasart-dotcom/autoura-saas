import { describe, it, expect } from 'vitest'
import { resolveConciergeTenant, isConciergeEnabled } from '@/lib/concierge-brand-routing'
import { normalizeBrandKey } from '@/lib/concierge-brief-schema'

// ============================================
// Stub Supabase client: chainable, returns preset rows per table.
// Only the methods the routing lib touches are implemented.
// ============================================
function stubDb(rows: Record<string, unknown | null>) {
  const chain = (table: string) => {
    const self: any = {
      select: () => self,
      eq: () => self,
      order: () => self,
      limit: () => self,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
    }
    return self
  }
  return { from: (table: string) => chain(table) } as any
}

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'
const NO_ENV = {} as Record<string, string | undefined>

// ============================================
// normalizeBrandKey
// ============================================
describe('normalizeBrandKey', () => {
  it('lowercases and trims', () => {
    expect(normalizeBrandKey('  Travel2Egypt  ')).toBe('travel2egypt')
  })
  it('returns null for absent / non-string / empty values', () => {
    expect(normalizeBrandKey(undefined)).toBeNull()
    expect(normalizeBrandKey(null)).toBeNull()
    expect(normalizeBrandKey(42)).toBeNull()
    expect(normalizeBrandKey('   ')).toBeNull()
  })
})

// ============================================
// resolveConciergeTenant
// ============================================
describe('resolveConciergeTenant', () => {
  it('routes a mapped active brand to its tenant', async () => {
    const db = stubDb({ concierge_brand_mappings: { tenant_id: TENANT_B, active: true } })
    const r = await resolveConciergeTenant(db, 'Brand-B', NO_ENV)
    expect(r).toEqual({ ok: true, tenantId: TENANT_B, via: 'brand_mapping', brand: 'brand-b' })
  })

  it('rejects an unmapped brand (never falls back — wrong-tenant delivery)', async () => {
    const db = stubDb({ concierge_brand_mappings: null, tenants: { id: TENANT_A } })
    const r = await resolveConciergeTenant(db, 'ghost-brand', { CONCIERGE_WEBHOOK_TENANT_ID: TENANT_A })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('unknown_brand')
  })

  it('rejects a deactivated brand', async () => {
    const db = stubDb({ concierge_brand_mappings: { tenant_id: TENANT_B, active: false } })
    const r = await resolveConciergeTenant(db, 'brand-b', NO_ENV)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('inactive_brand')
  })

  it('falls back to the env tenant when no brand is sent (legacy v1 path)', async () => {
    const db = stubDb({})
    const r = await resolveConciergeTenant(db, undefined, { CONCIERGE_WEBHOOK_TENANT_ID: TENANT_A })
    expect(r).toEqual({ ok: true, tenantId: TENANT_A, via: 'env', brand: null })
  })

  it('falls back to the oldest tenant when no brand and no env', async () => {
    const db = stubDb({ tenants: { id: TENANT_A } })
    const r = await resolveConciergeTenant(db, undefined, NO_ENV)
    expect(r).toEqual({ ok: true, tenantId: TENANT_A, via: 'first_tenant', brand: null })
  })

  it('errors when no brand, no env, and no tenants exist', async () => {
    const db = stubDb({ tenants: null })
    const r = await resolveConciergeTenant(db, undefined, NO_ENV)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('no_tenant')
  })

  it('normalizes the inbound brand before lookup', async () => {
    const db = stubDb({ concierge_brand_mappings: { tenant_id: TENANT_B, active: true } })
    const r = await resolveConciergeTenant(db, '  BRAND-B ', NO_ENV)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.brand).toBe('brand-b')
  })
})

// ============================================
// isConciergeEnabled (fail closed)
// ============================================
describe('isConciergeEnabled', () => {
  it('true when the tenant feature is enabled', async () => {
    const db = stubDb({ tenant_features: { concierge_enabled: true } })
    expect(await isConciergeEnabled(db, TENANT_A)).toBe(true)
  })
  it('false when the feature is disabled', async () => {
    const db = stubDb({ tenant_features: { concierge_enabled: false } })
    expect(await isConciergeEnabled(db, TENANT_A)).toBe(false)
  })
  it('false when the tenant has no features row (fail closed)', async () => {
    const db = stubDb({ tenant_features: null })
    expect(await isConciergeEnabled(db, TENANT_A)).toBe(false)
  })
})
