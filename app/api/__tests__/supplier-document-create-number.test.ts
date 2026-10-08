/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/supplier-documents numbered through the caller's RLS client, which
// sees only its own tenant's vouchers, while document_number is UNIQUE across
// every tenant: tenant B's first hotel voucher got HV-YYYY-0001, which tenant A
// already had, and the insert failed. The number now comes from every tenant's.
import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => {
  const year = new Date().getFullYear()
  const inserted: any[] = []
  // What a read of the highest number sees through each client.
  const reader = (highest: string | null) => ({
    from: () => {
      const b: any = {
        select: () => b, like: () => b, order: () => b,
        limit: async () => ({ data: highest ? [{ document_number: highest }] : [] }),
        insert: (rows: any[]) => { inserted.push(...rows); return b },
        single: async () => ({ data: inserted.at(-1), error: null }),
      }
      return b
    },
  })
  return { year, inserted, rls: reader(null), admin: reader(`HV-${year}-0041`) }
})

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 'tenant-B', user: { id: 'u1' }, supabase: h.rls }),
  createAdminClient: () => h.admin,
}))

import { POST } from '@/app/api/supplier-documents/route'

const post = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as any)

describe('POST /api/supplier-documents numbering', () => {
  it('counts on from every tenant’s numbers, not only the caller’s', async () => {
    const res = await post({ document_type: 'hotel_voucher', supplier_name: 'S', client_name: 'C' })
    expect(res.status).toBe(200)
    expect(h.inserted.at(-1).document_number).toBe(`HV-${h.year}-0042`)
    expect(h.inserted.at(-1).tenant_id).toBe('tenant-B')
  })

  it('keeps a number the caller chose', async () => {
    await post({ document_type: 'hotel_voucher', document_number: 'CUSTOM-1', supplier_name: 'S', client_name: 'C' })
    expect(h.inserted.at(-1).document_number).toBe('CUSTOM-1')
  })
})
