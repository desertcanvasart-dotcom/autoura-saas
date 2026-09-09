// Phase 3 of the portable supplier_code work (shared with the sibling
// travel-ops-pro): a rate CSV exported from the other install carries each
// supplier's SUP-#### code, and the bulk import resolves it back to THIS
// tenant's supplier_id instead of dropping the unknown foreign UUID (which is
// what left imported rates unattached). This pins the config half: every
// supplier-bearing rate config carries the virtual supplier_code column.
import { describe, it, expect } from 'vitest'
import { RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

describe('supplier_code column on every supplier-bearing rate config', () => {
  it('sits right after supplier_id, importable and optional', () => {
    for (const [table, cfg] of Object.entries(RATE_TABLE_CONFIGS)) {
      const sid = cfg.columns.findIndex(c => c.name === 'supplier_id')
      const code = cfg.columns.find(c => c.name === 'supplier_code')
      if (sid < 0) {
        expect(code, `${table} has no supplier_id, so no supplier_code`).toBeUndefined()
        continue
      }
      expect(code, `${table} is missing supplier_code`).toBeDefined()
      expect(code!.required, `${table} supplier_code must be optional`).toBe(false)
      expect(code!.exportOnly ?? false, `${table} supplier_code must be importable`).toBe(false)
      expect(cfg.columns[sid + 1].name, `${table} supplier_code should follow supplier_id`).toBe('supplier_code')
    }
  })

  it('is a virtual key — at least the supplier-bearing tables carry it', () => {
    const withCode = Object.values(RATE_TABLE_CONFIGS).filter(c =>
      c.columns.some(col => col.name === 'supplier_code'),
    )
    expect(withCode.length).toBeGreaterThan(0)
  })
})
