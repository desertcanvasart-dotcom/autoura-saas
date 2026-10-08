// Marking a voucher sent PUT { status: 'sent', sent_via: 'email' }; there is no
// sent_via column, the route passed the body straight to .update(), the update
// failed, nothing checked, and no voucher ever reached "sent". The route now
// writes only editable columns, and that list must stay inside the table.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { EDITABLE_SUPPLIER_DOCUMENT_FIELDS, editableSupplierDocumentFields } from '@/lib/documents/supplier-document-fields'

const h = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[] }))

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({
    error: null, status: 200, tenant_id: 't1', user: { id: 'u1' },
    supabase: {
      from: () => {
        const b: Record<string, unknown> = {}
        b.update = (data: Record<string, unknown>) => { h.updates.push(data); return b }
        b.eq = () => b
        b.select = () => b
        b.single = async () => ({ data: { id: 'doc-1' }, error: null })
        return b
      },
    },
  }),
}))

import { PUT } from '@/app/api/supplier-documents/[id]/route'

function supplierDocumentColumns(): Set<string> {
  const src = readFileSync(join(__dirname, '..', '..', '..', 'types', 'database.types.ts'), 'utf8')
  const row = src.match(/^ {6}supplier_documents: \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/m)
  if (!row) throw new Error('supplier_documents not found in types/database.types.ts')
  return new Set(row[1].split('\n').map(l => l.match(/^ {10}([a-z_0-9]+)\??:/)?.[1]).filter(Boolean) as string[])
}

describe('editable supplier-document fields', () => {
  it('are all real columns of supplier_documents', () => {
    const columns = supplierDocumentColumns()
    expect(EDITABLE_SUPPLIER_DOCUMENT_FIELDS.filter(f => !columns.has(f))).toEqual([])
  })

  it('never include the row’s identity, tenant or trip', () => {
    for (const f of ['id', 'tenant_id', 'itinerary_id', 'created_at', 'updated_at']) {
      expect(EDITABLE_SUPPLIER_DOCUMENT_FIELDS).not.toContain(f)
    }
  })

  it('drop anything else', () => {
    expect(editableSupplierDocumentFields({ status: 'sent', sent_via: 'email', itinerary: {}, tenant_id: 'x' })).toEqual({ status: 'sent' })
    expect(editableSupplierDocumentFields(null)).toEqual({})
  })
})

describe('PUT /api/supplier-documents/[id]', () => {
  it('marks a voucher sent even when the page also sends sent_via', async () => {
    const req = new Request('http://x', { method: 'PUT', body: JSON.stringify({ status: 'sent', sent_via: 'email' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ id: 'doc-1' }) })
    expect(res.status).toBe(200)
    const written = h.updates.at(-1)!
    expect(written).not.toHaveProperty('sent_via')
    expect(written.status).toBe('sent')
    expect(typeof written.sent_at).toBe('string')
  })
})
