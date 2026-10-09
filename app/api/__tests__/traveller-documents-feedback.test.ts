// Travellers and staff were left guessing:
// - a file over 10 MB arrived cut short and the portal said "No file selected.";
// - "View" opened its tab after a fetch, which Safari blocks as a popup;
// - a failed Remove showed nothing;
// - the office list showed "Nothing uploaded yet" on any database error, and
//   its 10-minute links went dead on a tab left open.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ error: null as { code?: string; message: string } | null }))

const db = {
  from: () => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) b[m] = () => b
    b.then = (r: (v: unknown) => void) => r({ data: h.error ? null : [], error: h.error })
    return b
  },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' } }) }) },
}

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => db,
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, supabase: db }),
}))
vi.mock('@/lib/booking-portal', () => ({
  portalVerifyCookieName: () => 'c',
  resolvePortalPassenger: async () => ({ ok: true, link: { booking_id: 'b1', tenant_id: 't1', form_locked: false } }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ success: true }), getClientIdentifier: () => 'ip' }))

import { POST as upload } from '@/app/api/portal/[token]/travellers/[id]/documents/route'
import { GET as staffList } from '@/app/api/bookings/[id]/traveller-documents/route'
import { REJECTION_MESSAGE } from '@/lib/portal/traveller-documents'

beforeEach(() => { h.error = null })

describe('portal upload over the size cap', () => {
  it('says the file is too large, not that none was selected', async () => {
    const req = new Request('http://x', {
      method: 'POST', body: 'cut short', headers: { 'content-length': String(12 * 1024 * 1024) },
    }) as unknown as Record<string, unknown>
    req.cookies = { get: () => undefined }
    const res = await upload(req as never, { params: Promise.resolve({ token: 'tok', id: 'p1' }) })
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe(REJECTION_MESSAGE.too_large)
  })
})

describe('the office list of traveller documents', () => {
  const list = () => staffList(new Request('http://x'), { params: Promise.resolve({ id: 'b1' }) })

  it('reports a database error instead of an empty list', async () => {
    h.error = { code: '57014', message: 'statement timeout' }
    const res = await list()
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
  })

  it('is empty, not an error, before the documents table exists', async () => {
    h.error = { code: '42P01', message: 'relation does not exist' }
    expect(await (await list()).json()).toEqual({ success: true, documents: [] })
  })
})

describe('the pages', () => {
  const portal = readFileSync(join(process.cwd(), 'app/portal/[token]/TravellerDocuments.tsx'), 'utf8')
  const booking = readFileSync(join(process.cwd(), 'app/bookings/[id]/page.tsx'), 'utf8')

  it('the portal opens View’s tab during the click, before the fetch', () => {
    const view = portal.slice(portal.indexOf('const view = async'), portal.indexOf('const remove = async'))
    expect(view.indexOf("window.open('', '_blank')")).toBeGreaterThan(-1)
    expect(view.indexOf("window.open('', '_blank')")).toBeLessThan(view.indexOf('await fetch'))
  })

  it('the portal checks the size before uploading, and says when Remove fails', () => {
    expect(portal).toContain('if (file.size > MAX_DOCUMENT_BYTES) {')
    expect(portal).toContain("Could not remove the document — please try again.")
  })

  it('the office list shows load errors and renews its links while open', () => {
    expect(booking).toContain("Could not load the travellers&apos; documents.")
    expect(booking).toContain('setInterval(fetchTravellerDocs, 9 * 60 * 1000)')
  })
})
