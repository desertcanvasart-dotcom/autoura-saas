import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { contractNumber, contractTravelers, contractDuration, contractDestinations } from '@/lib/contract-facts'
import { uploadShareablePdf, SENT_DOCUMENTS_BUCKET, SENT_DOCUMENT_LINK_SECONDS } from '@/lib/storage/shareable-pdf'
import type { SupabaseClient } from '@supabase/supabase-js'

// Live 2026-09-24, ITN-S-2026-6386 (Cairo / Alexandria / Siwa, 4 adults):
// the contract read "Cairo, Luxor, Aswan", "N/A", "persons", TC-2025-…;
// "Send Contract via WhatsApp" failed "Bucket not found"; Generate Documents
// made 2 transport vouchers and silently skipped the 5 entrance fees.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const code = (src: string) => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('contract facts come from the itinerary', () => {
  const it6386 = { id: '13668ea5-5316-4bc7', num_adults: 4, num_children: 0, total_days: 11, start_date: '2026-11-01', end_date: '2026-11-11' }

  it('number carries the year it is issued', () => {
    expect(contractNumber(it6386.id, new Date('2026-09-24'))).toBe('TC-2026-13668EA5')
  })
  it('travellers = adults + children; unknown stays unknown', () => {
    expect(contractTravelers(it6386)).toBe(4)
    expect(contractTravelers({ id: 'x' })).toBeNull()
  })
  it('duration from the stored length, else the dates', () => {
    expect(contractDuration(it6386)).toBe('11 days')
    expect(contractDuration({ id: 'x', start_date: '2026-11-01', end_date: '2026-11-01' })).toBe('1 day')
    expect(contractDuration({ id: 'x' })).toBeNull()
  })
  it("destinations are the trip's own cities, in order, once — never a default", () => {
    expect(contractDestinations([
      { day_number: 3, city: 'Alexandria', overnight_city: 'Alexandria' },
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 5, city: 'Siwa', overnight_city: 'Siwa' },
      { day_number: 11, city: 'cairo' },
    ])).toBe('Cairo, Alexandria, Siwa')
    expect(contractDestinations([])).toBe('')
  })
  it('neither contract path invents Cairo, Luxor, Aswan or a 2025 number any more', () => {
    for (const f of ['app/documents/contract/[id]/page.tsx', 'app/api/whatsapp/send-contract/route.ts']) {
      const src = code(read(f))
      expect(src, f).not.toMatch(/\|\| 'Cairo, Luxor, Aswan'|destinations: 'Cairo, Luxor, Aswan'/)
      expect(src, f).not.toContain('TC-2025-')
    }
  })
})

describe('PDFs sent by WhatsApp', () => {
  function fakeStorage(fail?: 'upload' | 'sign') {
    const calls: Record<string, unknown>[] = []
    const admin = {
      storage: {
        from: (bucket: string) => ({
          upload: async (p: string) => { calls.push({ op: 'upload', bucket, p }); return { error: fail === 'upload' ? { message: 'Bucket not found' } : null } },
          createSignedUrl: async (p: string, ttl: number) => {
            calls.push({ op: 'sign', bucket, p, ttl })
            return fail === 'sign' ? { data: null, error: { message: 'nope' } } : { data: { signedUrl: `https://x/sign/${bucket}/${p}?token=t` }, error: null }
          },
        }),
      },
    } as unknown as SupabaseClient
    return { admin, calls }
  }

  it('go to the private bucket under the tenant, shared by a 7-day signed link', async () => {
    const { admin, calls } = fakeStorage()
    const r = await uploadShareablePdf(admin, { tenantId: 't1', kind: 'contracts', fileName: 'contract 1.pdf', bytes: new Uint8Array([1]) })
    expect(r).toEqual({ ok: true, path: 't1/contracts/contract-1.pdf', url: `https://x/sign/${SENT_DOCUMENTS_BUCKET}/t1/contracts/contract-1.pdf?token=t` })
    expect(calls[1]).toMatchObject({ op: 'sign', ttl: SENT_DOCUMENT_LINK_SECONDS })
  })
  it('an upload or signing failure is reported, never a dead link', async () => {
    expect((await uploadShareablePdf(fakeStorage('upload').admin, { tenantId: 't', kind: 'invoices', fileName: 'a.pdf', bytes: new Uint8Array() })).ok).toBe(false)
    expect((await uploadShareablePdf(fakeStorage('sign').admin, { tenantId: 't', kind: 'invoices', fileName: 'a.pdf', bytes: new Uint8Array() })).ok).toBe(false)
  })
  it('no sender uses the non-existent documents bucket or a public URL', () => {
    for (const f of [
      'app/api/whatsapp/send-contract/route.ts',
      'app/api/whatsapp/send-invoice/route.ts',
      'app/api/whatsapp/send-supplier-document/route.ts',
      'app/api/quotes/[type]/[id]/send-whatsapp/route.ts',
    ]) {
      const src = code(read(f))
      expect(src, f).not.toMatch(/from\('documents'\)/)
      expect(src, f).not.toContain('getPublicUrl')
      expect(src, f).toContain('uploadShareablePdf(')
    }
  })
  it('migration 387 creates the bucket, private', () => {
    const sql = read('supabase/migrations/387_sent_documents_bucket.sql')
    expect(sql).toMatch(/VALUES \('sent-documents', 'sent-documents', false\)/)
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET public = false')
  })
})

describe('Generate Documents handles every service type the grid saves', () => {
  it('each grid service type is mapped explicitly (a document, or none on purpose)', () => {
    const save = read('app/api/pricing-grid/save/route.ts')
    const fn = save.slice(save.indexOf('function getServiceType'))
    const gridTypes = new Set([...fn.slice(0, fn.indexOf('return map')).matchAll(/:\s*'(\w+)'/g)].map(m => m[1]))
    expect(gridTypes.size).toBeGreaterThan(5)

    const gen = read('app/api/itineraries/[id]/generate-documents/route.ts')
    const table = gen.slice(gen.indexOf('const SERVICE_TO_DOC_TYPE'), gen.indexOf('// Map supplier types'))
    for (const t of gridTypes) expect(table, `grid type '${t}' unmapped — skipped silently`).toMatch(new RegExp(`\\n\\s+${t}: \\{`))
  })
  it('entrance fees make a service order', () => {
    expect(read('app/api/itineraries/[id]/generate-documents/route.ts')).toMatch(/entrance_fee: \{ docType: 'service_order', category: 'entrance' \}/)
  })
  it('a grid cruise line gets a cruise voucher, not a hotel voucher', () => {
    expect(read('app/api/itineraries/[id]/generate-documents/route.ts')).toContain("startsWith('[pricing-grid:cruise]')")
  })
})
