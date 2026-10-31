import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'

const notifyTeam = vi.fn(async (n: Record<string, unknown>) => void n)
vi.mock('@/lib/notifications', () => ({ notifyTeam: (n: Record<string, unknown>) => notifyTeam(n) }))

import { answerAllowed } from '@/lib/bookings/supplier-answer'
import { refreshedLinkExpiry, replyLinkExpiry } from '@/lib/supplier-reply-link'
import { clearSupplierDayOff, markSupplierDayOff } from '@/lib/supplier-days-off-write'

const read = (p: string) => readFileSync(p, 'utf8')

describe('SN-5: a refused supplier answer writes nothing', () => {
  it('allows only the moves the one writer would allow', () => {
    expect(answerAllowed('requested', 'accepted', 'supplier')).toBe(true)
    expect(answerAllowed('pending', 'assigned', null)).toBe(true) // the answer proves it was sent
    expect(answerAllowed('assigned', 'assigned', 'supplier')).toBe(true) // a changed car or guide
    expect(answerAllowed('done', 'assigned', 'supplier')).toBe(false)
    expect(answerAllowed('assigned', 'accepted', 'supplier')).toBe(false)
    expect(answerAllowed('requested', 'accepted', 'own')).toBe(false)
  })

  it('late answers stay as the states allow (operator decision D2, unchanged)', () => {
    expect(answerAllowed('expired', 'accepted', 'supplier')).toBe(true)
    expect(answerAllowed('declined', 'assigned', 'supplier')).toBe(true)
  })

  it('checks before the plate / guide / driver note are written', () => {
    const a = read('lib/bookings/supplier-answer.ts')
    const check = a.indexOf('if (!answerAllowed(line.status, to, line.resource_kind))')
    expect(check).toBeGreaterThan(0)
    expect(check).toBeLessThan(a.indexOf('assigned_vehicle_plate:'))
    expect(check).toBeLessThan(a.indexOf("to: 'requested'"))
  })
})

describe('SN-7: re-asking refreshes the reply link expiry', () => {
  it('matches what a fresh link would get', () => {
    const fresh = replyLinkExpiry('2026-11-10')!
    expect(refreshedLinkExpiry(null, '2026-11-10')).toBe(fresh) // no expiry, line now dated
    expect(refreshedLinkExpiry('2026-10-01T23:59:59Z', '2026-11-10')).toBe(fresh) // expired / date moved
    expect(refreshedLinkExpiry('2026-11-11T23:59:59+00:00', '2026-11-10')).toBeUndefined() // already right
    expect(refreshedLinkExpiry(null, null)).toBeUndefined()
  })

  it('the request route updates a reused link with it', () => {
    const r = read('app/api/bookings/[id]/suppliers/[lineId]/request/route.ts')
    expect(r).toContain("select('token, expires_at')")
    expect(r).toContain('refreshedLinkExpiry(existing.expires_at as string | null, line.service_date as string | null)')
    expect(r).toContain(".update({ expires_at })")
  })
})

describe('SN-8: cover with own team checks the move before writing', () => {
  it('canTransition to assigned runs before the assignment row and the line update', () => {
    const r = read('app/api/bookings/[id]/suppliers/[lineId]/cover/route.ts')
    const check = r.indexOf("canTransition(line.status, 'assigned', 'own')")
    expect(check).toBeGreaterThan(0)
    expect(check).toBeLessThan(r.indexOf("from('itinerary_resources').insert("))
    expect(check).toBeLessThan(r.indexOf("resource_kind: 'own'"))
  })
})

type Call = { table: string; op: string; args: unknown[] }
function fakeDb(opts: { upsertError?: string } = {}) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      const result = () => {
        if (calls.some(c => c.table === table && c.op === 'upsert')) return { data: null, error: opts.upsertError ? { message: opts.upsertError } : null }
        return { data: table === 'suppliers' ? { name: 'Nile Cars', company_name: null } : null, error: null }
      }
      for (const op of ['upsert', 'delete', 'select', 'eq']) {
        q[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return q }
      }
      q.maybeSingle = async () => result()
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res)
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

describe('SN-9: one days-off writer for the page and the inbox', () => {
  beforeEach(() => notifyTeam.mockClear())

  it('marks the day for that supplier at that agency and tells the office', async () => {
    const { db, calls } = fakeDb()
    const r = await markSupplierDayOff(db, { tenantId: 't1', supplierId: 's1' }, { day: '2026-11-05', note: ' wedding ' }, { via: 'Marked in their inbox', today: '2026-11-01' })
    expect(r).toEqual({ ok: true })
    expect(calls.find(c => c.op === 'upsert')?.args[0]).toEqual({ tenant_id: 't1', supplier_id: 's1', day: '2026-11-05', note: 'wedding', marked_by: 'supplier' })
    expect(notifyTeam).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 't1', dedupe_key: 'supplier-day-off:s1:2026-11-05', title: 'Nile Cars is not available on 2026-11-05', message: 'wedding',
    }))
  })

  it('a bad day or a failed save tells nobody', async () => {
    const bad = await markSupplierDayOff(fakeDb().db, { tenantId: 't1', supplierId: 's1' }, { day: '2026-10-01' }, { via: 'x', today: '2026-11-01' })
    expect(bad).toMatchObject({ ok: false, status: 400 })
    const failed = await markSupplierDayOff(fakeDb({ upsertError: 'boom' }).db, { tenantId: 't1', supplierId: 's1' }, { day: '2026-11-05' }, { via: 'x', today: '2026-11-01' })
    expect(failed).toMatchObject({ ok: false, status: 500 })
    expect(notifyTeam).not.toHaveBeenCalled()
  })

  it('clears only a day the supplier marked', async () => {
    const { db, calls } = fakeDb()
    expect(await clearSupplierDayOff(db, { tenantId: 't1', supplierId: 's1' }, 42)).toMatchObject({ ok: false, status: 400 })
    expect(await clearSupplierDayOff(db, { tenantId: 't1', supplierId: 's1' }, '2026-11-05')).toEqual({ ok: true })
    expect(calls.filter(c => c.op === 'eq').map(c => c.args)).toEqual([['tenant_id', 't1'], ['supplier_id', 's1'], ['day', '2026-11-05'], ['marked_by', 'supplier']])
  })

  it('both doors use it', () => {
    for (const p of ['app/api/supplier-page/[token]/days-off/route.ts', 'app/api/supplier-account/days-off/route.ts']) {
      const r = read(p)
      expect(r, p).toContain('markSupplierDayOff(db, ')
      expect(r, p).toContain('clearSupplierDayOff(db, ')
      expect(r, p).not.toContain("from('supplier_unavailable_days')")
    }
  })
})

describe('SN-10 / SN-14: bounded reads', () => {
  it('the deadline cron reads reminders 100 ids at a time', () => {
    const r = read('app/api/cron/service-booking-deadlines/route.ts')
    expect(r).toContain('const IN_CHUNK = 100')
    expect(r).toContain(".in('service_booking_id', ids.slice(i, i + IN_CHUNK))")
  })

  it("the booking's supplier list reads days off only within the booking's dates, in parallel", () => {
    const r = read('app/api/bookings/[id]/suppliers/route.ts')
    expect(r).toContain(".gte('day', days[0]).lte('day', days[days.length - 1])")
    expect(r).toContain('const [expenses, off, links, pages] = await Promise.all([')
    expect(r).not.toContain('const lineIds')
  })
})
