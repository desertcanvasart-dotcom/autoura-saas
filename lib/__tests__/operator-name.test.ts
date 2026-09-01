// operatorNameForSupplier: the supplier IS the operator, within one tenant.
import { describe, it, expect } from 'vitest'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'

/** Records the filters applied, so tenant scoping can be asserted. */
const dbWith = (row: { name: string } | null) => {
  const filters: Record<string, string> = {}
  const chain = {
    eq: (col: string, val: string) => { filters[col] = val; return chain },
    maybeSingle: async () => ({ data: row }),
  }
  return {
    filters,
    db: { from: () => ({ select: () => chain }) },
  }
}

describe('operatorNameForSupplier', () => {
  it("uses the supplier's name, whatever the client sent", async () => {
    const { db } = dbWith({ name: 'Egyptian National Railways (ENR)' })
    expect(await operatorNameForSupplier(db, { tenantId: 't1', supplierId: 's1', fallback: 'Spanish Trains (Talgo)' }))
      .toBe('Egyptian National Railways (ENR)')
  })

  it('scopes the lookup to the tenant', async () => {
    // This runs on an admin client: an id from another tenant's roster would
    // otherwise write that tenant's supplier name into this tenant's rate.
    const { db, filters } = dbWith({ name: 'ENR' })
    await operatorNameForSupplier(db, { tenantId: 't1', supplierId: 's1', fallback: null })
    expect(filters).toEqual({ id: 's1', tenant_id: 't1' })
  })

  it('fills a name for a rate whose client sent none', async () => {
    const { db } = dbWith({ name: 'ENR' })
    expect(await operatorNameForSupplier(db, { tenantId: 't1', supplierId: 's1', fallback: undefined })).toBe('ENR')
    expect(await operatorNameForSupplier(db, { tenantId: 't1', supplierId: 's1', fallback: '' })).toBe('ENR')
  })

  it('keeps the caller value when there is no supplier', async () => {
    const { db } = dbWith(null)
    expect(await operatorNameForSupplier(db, { tenantId: 't1', supplierId: null, fallback: 'Watania Sleeping Trains' }))
      .toBe('Watania Sleeping Trains')
    expect(await operatorNameForSupplier(db, { tenantId: 't1', supplierId: '', fallback: '  Talgo  ' })).toBe('Talgo')
  })

  it('does not blank an existing name when the supplier is unreadable or foreign', async () => {
    const { db } = dbWith(null)
    expect(await operatorNameForSupplier(db, { tenantId: 't1', supplierId: 'other-tenant', fallback: 'Talgo' }))
      .toBe('Talgo')
  })

  it('returns null when neither a supplier nor a name is given', async () => {
    const { db } = dbWith(null)
    expect(await operatorNameForSupplier(db, { tenantId: 't1', supplierId: '', fallback: '   ' })).toBeNull()
  })
})
