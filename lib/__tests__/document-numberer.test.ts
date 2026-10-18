/* eslint-disable @typescript-eslint/no-explicit-any */
// document_number is UNIQUE across every tenant. The create route numbered
// from the caller's own tenant's numbers (its RLS client), so it handed out
// numbers another tenant already had; generate-documents shared one
// module-level counter between overlapping requests. Each request now owns a
// numberer, and a clash at insert is renumbered and retried.
import { describe, it, expect } from 'vitest'
import { createDocumentNumberer, insertNumbered, supplierDocumentPrefix } from '@/lib/documents/numberer'

function db(highest: Record<string, string | null>) {
  let reads = 0
  const client = {
    from: () => {
      let pattern = ''
      const b: any = {
        select: () => b,
        like: (_c: string, p: string) => { pattern = p; return b },
        order: () => b,
        limit: async () => {
          reads++
          const n = highest[pattern.split('-')[0]]
          return { data: n ? [{ document_number: n }] : [] }
        },
      }
      return b
    },
  }
  return { client, highest, reads: () => reads }
}

describe('createDocumentNumberer', () => {
  it('counts on from the highest number, per prefix, reading each prefix once', async () => {
    const d = db({ TV: 'TV-2026-0007', GA: null })
    const next = createDocumentNumberer(d.client, supplierDocumentPrefix, 2026)
    expect(await next('transport_voucher')).toBe('TV-2026-0008')
    expect(await next('guide_assignment')).toBe('GA-2026-0001')
    expect(await next('transport_voucher')).toBe('TV-2026-0009')
    expect(d.reads()).toBe(2)
  })

  it('keeps two overlapping requests apart', async () => {
    const d = db({ TV: 'TV-2026-0007' })
    const a = createDocumentNumberer(d.client, supplierDocumentPrefix, 2026)
    const b = createDocumentNumberer(d.client, supplierDocumentPrefix, 2026)
    expect(await a('transport_voucher')).toBe('TV-2026-0008')
    expect(await b('transport_voucher')).toBe('TV-2026-0008') // same start: the insert retry resolves it
    expect(await a('transport_voucher')).toBe('TV-2026-0009') // not advanced by b
  })

  it('numbers activity vouchers AV and unknown types SD', () => {
    expect(supplierDocumentPrefix('activity_voucher')).toBe('AV')
    expect(supplierDocumentPrefix('something_else')).toBe('SD')
  })
})

describe('insertNumbered', () => {
  const year = new Date().getFullYear()

  it('renumbers and retries when another request took the number in between', async () => {
    const d = db({ HV: `HV-${year}-0003` })
    const tried: string[] = []
    const result = await insertNumbered([{ document_type: 'hotel_voucher' }], d.client, async rows => {
      tried.push(rows[0].document_number!)
      if (tried.length === 1) {
        d.highest.HV = `HV-${year}-0004` // someone else inserted 0004 first
        return { data: null, error: { code: '23505', message: 'duplicate key' } }
      }
      return { data: rows, error: null }
    })
    expect(tried).toEqual([`HV-${year}-0004`, `HV-${year}-0005`])
    expect(result.error).toBeNull()
  })

  it('gives up after its retries and returns the error', async () => {
    const d = db({})
    let calls = 0
    const result = await insertNumbered([{ document_type: 'hotel_voucher' }], d.client, async () => {
      calls++
      return { data: null, error: { code: '23505', message: 'duplicate key' } }
    }, 2)
    expect(calls).toBe(3)
    expect(result.error?.code).toBe('23505')
  })

  it('does not retry other errors', async () => {
    const d = db({})
    let calls = 0
    await insertNumbered([{ document_type: 'hotel_voucher' }], d.client, async () => {
      calls++
      return { data: null, error: { code: '42501', message: 'denied' } }
    })
    expect(calls).toBe(1)
  })
})
