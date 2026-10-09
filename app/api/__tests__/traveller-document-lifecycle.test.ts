// Passport files must not outlive their record, and a traveller must never be
// left with no passport on file:
// - deleting a booking cascaded its document rows away but left the files in
//   the bucket, where the purge cron (which finds files through those rows)
//   could never reach them;
// - replacing a passport deleted the old one before the new row went in, so a
//   failed insert left the traveller with none;
// - the purge cron ran for anyone when CRON_SECRET was unset.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  objects: new Set<string>(),
  failInsert: false,
  failRemove: false,
}))

// A small in-memory PostgREST: enough of select/eq/is/insert/update/delete.
function query(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: { kind: 'select' | 'update' | 'delete' | 'insert'; data?: Row } = { kind: 'select' }
  let head = false
  const rows = () => (h.tables[table] ??= [])
  const matching = () => rows().filter(r => filters.every(f => f(r)))
  const run = () => {
    if (op.kind === 'insert') {
      if (h.failInsert) return { data: null, error: { message: 'insert failed' } }
      const row = { id: `new-${rows().length}`, purged_at: null, ...op.data }
      rows().push(row)
      return { data: [row], error: null }
    }
    const hit = matching()
    if (op.kind === 'update') hit.forEach(r => Object.assign(r, op.data))
    if (op.kind === 'delete') h.tables[table] = rows().filter(r => !hit.includes(r))
    return { data: head ? null : hit, count: hit.length, error: null }
  }
  const b: Record<string, unknown> = {
    select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return b },
    insert: (data: Row) => { op = { kind: 'insert', data }; return b },
    update: (data: Row) => { op = { kind: 'update', data }; return b },
    delete: () => { op = { kind: 'delete' }; return b },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return b },
    order: () => b,
    not: () => b,
    lte: () => b,
    limit: () => b,
    in: () => b,
    maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error } },
    single: async () => { const r = run(); const d = (r.data as Row[] | null)?.[0] ?? null; return { data: d, error: r.error ?? (d ? null : { message: 'none' }) } },
    then: (res: (v: unknown) => void) => res(run()),
  }
  return b
}
const db = {
  from: (t: string) => query(t),
  storage: {
    from: () => ({
      upload: async (p: string) => { h.objects.add(p); return { error: null } },
      remove: async (paths: string[]) => {
        if (h.failRemove) return { error: { message: 'storage down' } }
        paths.forEach(p => h.objects.delete(p)); return { error: null }
      },
    }),
  },
}

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => db,
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', role: 'owner', user: { id: 'u1' }, supabase: db }),
}))
vi.mock('@/lib/booking-portal', () => ({
  portalVerifyCookieName: () => 'c',
  resolvePortalPassenger: async () => ({ ok: true, link: { booking_id: 'b1', tenant_id: 't1', form_locked: false } }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ success: true }), getClientIdentifier: () => 'ip' }))
vi.mock('@/lib/support/job-runs', () => ({ withJobRun: (_n: string, _c: unknown, fn: unknown) => fn }))

import { POST as upload } from '@/app/api/portal/[token]/travellers/[id]/documents/route'
import { DELETE as deleteBooking } from '@/app/api/bookings/[id]/route'
import { GET as purge } from '@/app/api/cron/purge-traveller-documents/route'
import { removeBookingDocumentFiles } from '@/lib/portal/traveller-documents'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
function uploadPassport() {
  const form = new FormData()
  form.append('file', new File([PNG], 'passport.png', { type: 'image/png' }))
  form.append('kind', 'passport')
  const req = new Request('http://x', { method: 'POST', body: form }) as unknown as Record<string, unknown>
  req.cookies = { get: () => undefined }
  return upload(req as never, { params: Promise.resolve({ token: 'tok', id: 'p1' }) })
}
const livePassports = () => h.tables.booking_passenger_documents.filter(r => r.kind === 'passport' && r.purged_at === null)

beforeEach(() => {
  h.failInsert = false
  h.failRemove = false
  h.objects = new Set(['b1/p1/old.png'])
  h.tables = {
    bookings: [{ id: 'b1', tenant_id: 't1', status: 'draft', booking_number: 'BK-1', end_date: '2026-12-01' }],
    booking_passenger_documents: [
      { id: 'old', booking_id: 'b1', passenger_id: 'p1', kind: 'passport', storage_path: 'b1/p1/old.png', purged_at: null },
    ],
  }
})

describe('replacing a passport', () => {
  it('swaps the old one for the new, file and row', async () => {
    const res = await uploadPassport()
    expect(res.status).toBe(200)
    expect(livePassports()).toHaveLength(1)
    expect(livePassports()[0].id).not.toBe('old')
    expect(h.objects.has('b1/p1/old.png')).toBe(false)
    expect(h.tables.booking_passenger_documents.some(r => r.id === 'old')).toBe(false)
  })

  it('keeps the old passport, file and row, when the new one cannot be saved', async () => {
    h.failInsert = true
    const res = await uploadPassport()
    expect(res.status).toBe(500)
    expect(livePassports().map(r => r.id)).toEqual(['old'])
    expect([...h.objects]).toEqual(['b1/p1/old.png'])
  })
})

describe('deleting a booking', () => {
  const del = () => deleteBooking({} as never, { params: Promise.resolve({ id: 'b1' }) })

  it('removes its travellers’ files before the rows cascade away', async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(h.objects.size).toBe(0)
    expect(h.tables.bookings).toHaveLength(0)
  })

  it('keeps the booking when the files cannot be removed', async () => {
    h.failRemove = true
    const res = await del()
    expect(res.status).toBe(500)
    expect(h.tables.bookings).toHaveLength(1)
  })

  it('leaves already-purged documents alone and treats a missing table as nothing to do', async () => {
    h.tables.booking_passenger_documents[0].purged_at = '2026-01-01'
    h.failRemove = true // would fail if anything were removed
    expect(await removeBookingDocumentFiles(db as never, 'b1')).toBeNull()
    const missing = { ...db, from: () => ({ select: () => ({ eq: () => ({ is: async () => ({ data: null, error: { code: '42P01', message: 'missing' } }) }) }) }) }
    expect(await removeBookingDocumentFiles(missing as never, 'b1')).toBeNull()
  })
})

describe('the purge cron', () => {
  const saved = process.env.CRON_SECRET
  afterEach(() => { process.env.CRON_SECRET = saved })
  const call = (auth?: string) => purge(new Request('http://x', { headers: auth ? { authorization: auth } : {} }) as never)

  it('refuses everyone when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    expect((await call()).status).toBe(401)
    expect((await call('Bearer undefined')).status).toBe(401)
  })

  it('runs with the right key', async () => {
    process.env.CRON_SECRET = 's3cret'
    expect((await call('Bearer wrong')).status).toBe(401)
    expect((await call('Bearer s3cret')).status).toBe(200)
  })
})
