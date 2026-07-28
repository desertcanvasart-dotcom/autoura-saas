import { describe, it, expect, vi, beforeEach } from 'vitest'

// The helper is the single place every outbound message learns who it is
// from. These pin the two behaviours that were wrong across 16 routes:
// a failed query must NOT look like a blank operator, and a missing tenant
// id must not silently produce one either.

const maybeSingle = vi.fn()
vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))

import { loadSenderTenant } from '@/lib/sender-tenant'

describe('loadSenderTenant', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the tenant when the row exists', async () => {
    maybeSingle.mockResolvedValue({
      data: { company_name: 'Afford Egypt', contact_email: 'hello@affordegypt.com' },
      error: null,
    })
    const t = await loadSenderTenant('tenant-1')
    expect(t?.company_name).toBe('Afford Egypt')
  })

  it('logs loudly and returns null on a query error — never a silent blank', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const t = await loadSenderTenant('tenant-1')
    expect(t).toBeNull()
    // The point: the failure is visible. Callers previously could not tell
    // this apart from "this tenant has no name".
    expect(console.error).toHaveBeenCalled()
  })

  it('refuses a missing tenant id rather than querying for undefined', async () => {
    for (const bad of [null, undefined, '']) {
      expect(await loadSenderTenant(bad as string), String(bad)).toBeNull()
    }
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('returns null (not undefined) when the tenant genuinely has no row', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await loadSenderTenant('ghost')).toBeNull()
  })
})
