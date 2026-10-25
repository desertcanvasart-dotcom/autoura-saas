import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  SYNC_EVENTS, WATCHED_TABLES, RATE_TABLES, publishTags, classifyChange, dispatchChange,
  type ChangeRow, type SyncEventType,
} from '@/lib/publish/sync/events'
import { runSyncCycle, type SyncAlert } from '@/lib/publish/sync/worker'
import { watchPublishWorker } from '@/lib/publish/sync/watchdog'
import { nextHealth, LAG_LIMIT_SECONDS, STALL_AFTER_SECONDS, REALERT_AFTER_MS, type HealthRow } from '@/lib/publish/sync/health'
import { createRevalidator, handleRevalidateRequest, REVALIDATE_PATH } from '@/lib/publish/sync/revalidate'
import { buildSignatureHeader } from '@/lib/concierge-webhook-auth'
import type { SyncStore, EnrolledCompany } from '@/lib/publish/sync/store'

// ============================================================================
// Publish sync contract (docs/publish/PLAN.md §5.3, items 1–3 and 6).
// The Sawa mirror never transmitted a payload because a handler was called by
// the wrong name, and nothing noticed. Every event here must have a schema and
// a handler that ACTUALLY RUNS through the one dispatch path, and must reach
// the renderer as the tags it promises; a broken payload must be visible.
// Database half (triggers, end to end on Postgres): publish-sync-triggers.test.ts
// ============================================================================

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const TOUR = '00000000-0000-4000-8000-0000000000f1'
const REC = '00000000-0000-4000-8000-0000000000c1'
const NOW = new Date('2026-10-25T12:00:00Z')

let nextId = 1
function row(over: Partial<ChangeRow>): ChangeRow {
  return {
    id: nextId++, tenant_id: A, table_name: 'tour_templates', record_id: REC, op: 'UPDATE',
    template_id: TOUR, changed_fields: ['template_name'], is_active: true,
    changed_at: new Date(NOW.getTime() - 60_000).toISOString(), attempts: 0, ...over,
  }
}

function health(tenant: string, over: Partial<HealthRow> = {}): HealthRow {
  return {
    tenant_id: tenant, status: 'ok', enrolled_at: '2026-10-01T00:00:00Z', last_event_at: null,
    last_success_at: null, last_failure_at: null, last_error: null, consecutive_failures: 0,
    lag_seconds: 0, alerted_status: null, alerted_at: null, updated_at: '2026-10-01T00:00:00Z', ...over,
  }
}

/** In-memory store with the same contract as supabaseSyncStore. */
function memoryStore(companies: EnrolledCompany[], rows: ChangeRow[], lastRun: string | null = NOW.toISOString()) {
  const state = {
    companies, rows: rows.map(r => ({ ...r, processed: false, note: null as string | null, error: null as string | null })),
  }
  const store: SyncStore = {
    async enrolled() { return state.companies.map(c => ({ ...c, health: { ...c.health } })) },
    async pending(limit) {
      return state.rows.filter(r => !r.processed).slice(0, limit).map(r => ({
        id: r.id, tenant_id: r.tenant_id, table_name: r.table_name, record_id: r.record_id, op: r.op, template_id: r.template_id,
        changed_fields: r.changed_fields, is_active: r.is_active, changed_at: r.changed_at, attempts: r.attempts,
      }))
    },
    async markProcessed(ids, note) { for (const r of state.rows) if (ids.includes(r.id)) { r.processed = true; r.note = note ?? null } },
    async markFailed(failed, error) { for (const r of state.rows) if (failed.some(f => f.id === r.id)) { r.attempts++; r.error = error } },
    async saveHealth(hs) { for (const h of hs) { const c = state.companies.find(c => c.health.tenant_id === h.tenant_id); if (c) c.health = h } },
    async lastWorkerRunAt() { return lastRun },
    async pruneProcessed() {},
  }
  return { store, state }
}

const enrolled = (...tenants: string[]) => tenants.map(t => ({ health: health(t), companyName: `Co ${t.slice(-1)}` }))

afterEach(() => vi.restoreAllMocks())

// ---------- 1. the registry is exhaustive ----------

describe('the event registry', () => {
  const ALL: SyncEventType[] = ['product.created', 'product.updated', 'product.unpublished', 'rate.changed', 'departure.changed', 'policy.changed', 'fx.changed']

  it('defines every event type — a schema and a handler function each', () => {
    expect(Object.keys(SYNC_EVENTS).sort()).toEqual([...ALL].sort())
    for (const type of ALL) {
      expect(typeof SYNC_EVENTS[type].schema.safeParse, type).toBe('function')
      expect(typeof SYNC_EVENTS[type].handle, type).toBe('function')
    }
  })

  it('every watched table and every rate table classifies to an event', () => {
    for (const table of [...WATCHED_TABLES, ...RATE_TABLES]) {
      const c = classifyChange(row({ table_name: table, op: 'INSERT' }))
      expect(c.ok, table).toBe(true)
    }
  })

  it('an unknown table is an error, never a silent skip', () => {
    expect(classifyChange(row({ table_name: 'bookings' }))).toEqual({ ok: false, error: 'no event for table "bookings"' })
  })
})

// ---------- 2. each event's handler actually runs, with the promised tags ----------

const FIXTURES: Array<{ type: SyncEventType; row: Partial<ChangeRow>; tags: string[] }> = [
  { type: 'product.created', row: { table_name: 'tour_templates', op: 'INSERT' }, tags: [publishTags.tour(TOUR), publishTags.tours(A)] },
  { type: 'product.updated', row: { table_name: 'tour_days', op: 'UPDATE', changed_fields: ['city'] }, tags: [publishTags.tour(TOUR), publishTags.tours(A)] },
  { type: 'product.unpublished', row: { table_name: 'tour_templates', changed_fields: ['is_active'], is_active: false }, tags: [publishTags.tour(TOUR), publishTags.tours(A)] },
  { type: 'rate.changed', row: { table_name: 'accommodation_rates', template_id: null, changed_fields: ['ppd_eur'] }, tags: [publishTags.tours(A)] },
  { type: 'departure.changed', row: { table_name: 'tour_departures', changed_fields: ['booked_pax'] }, tags: [publishTags.tour(TOUR)] },
  { type: 'policy.changed', row: { table_name: 'tenants', template_id: null, changed_fields: ['license_number'] }, tags: [publishTags.site(A)] },
  { type: 'policy.changed', row: { table_name: 'cancellation_policies', template_id: null, changed_fields: ['tiers'] }, tags: [publishTags.tours(A)] },
  { type: 'fx.changed', row: { table_name: 'exchange_rates', template_id: null, changed_fields: ['rate'] }, tags: [publishTags.tours(A)] },
]

describe('each event reaches its handler and the renderer', () => {
  for (const f of FIXTURES) {
    it(f.type, async () => {
      const handler = vi.spyOn(SYNC_EVENTS[f.type], 'handle')
      const { store, state } = memoryStore(enrolled(A), [row(f.row)])
      const revalidate = vi.fn(async () => {})
      const report = await runSyncCycle({ store, revalidate, alert: vi.fn(async () => {}), now: () => NOW })

      expect(handler, 'the handler fired through the registry').toHaveBeenCalledTimes(1)
      expect(revalidate).toHaveBeenCalledWith(A, f.tags)
      expect(state.rows.every(r => r.processed)).toBe(true)
      expect(report.success).toBe(true)
    })
  }

  it('a tour switched back on is an update, not an unpublish', () => {
    const c = classifyChange(row({ changed_fields: ['is_active'], is_active: true }))
    expect(c.ok && c.type).toBe('product.updated')
  })
  it('a deleted tour is unpublished', () => {
    const c = classifyChange(row({ op: 'DELETE' }))
    expect(c.ok && c.type).toBe('product.unpublished')
  })
  it('a company field no page shows refreshes nothing — and is still settled', async () => {
    const { store, state } = memoryStore(enrolled(A), [row({ table_name: 'tenants', template_id: null, changed_fields: ['stripe_customer_id'] })])
    const revalidate = vi.fn(async () => {})
    await runSyncCycle({ store, revalidate, alert: vi.fn(async () => {}), now: () => NOW })
    expect(revalidate).not.toHaveBeenCalled()
    expect(state.rows[0].processed).toBe(true)
  })
  it('a variation-level change whose tour is gone refreshes all the company\'s tours — a tour or day change may not omit it', () => {
    expect(dispatchChange(row({ table_name: 'variation_pricing', template_id: null, op: 'DELETE' }), A)).toEqual(
      { ok: true, type: 'product.updated', tags: [publishTags.tours(A)] })
    expect(dispatchChange(row({ table_name: 'tour_variation_services', changed_fields: ['optional_price_override'] }), A)).toEqual(
      { ok: true, type: 'product.updated', tags: [publishTags.tour(TOUR), publishTags.tours(A)] })
    expect(dispatchChange(row({ table_name: 'tour_variations', template_id: null }), A).ok).toBe(false)
  })
  it('a departure naming no tour refreshes all the company\'s tours', () => {
    expect(dispatchChange(row({ table_name: 'tour_departures', template_id: null }), A)).toEqual(
      { ok: true, type: 'departure.changed', tags: [publishTags.tours(A)] })
  })
  it('a shared rate row reaches every enrolled company, and only them', async () => {
    const { store } = memoryStore(enrolled(A, B), [row({ tenant_id: null, table_name: 'meal_rates', template_id: null })])
    const revalidate = vi.fn(async () => {})
    await runSyncCycle({ store, revalidate, alert: vi.fn(async () => {}), now: () => NOW })
    expect(revalidate.mock.calls.map(c => c[0]).sort()).toEqual([A, B])
  })
  it('many changes for one company are one refresh with each tag once', async () => {
    const { store } = memoryStore(enrolled(A), [
      row({ table_name: 'accommodation_rates', template_id: null }),
      row({ table_name: 'nile_cruises', template_id: null }),
      row({ table_name: 'tour_days' }),
    ])
    const revalidate = vi.fn(async () => {})
    await runSyncCycle({ store, revalidate, alert: vi.fn(async () => {}), now: () => NOW })
    expect(revalidate).toHaveBeenCalledTimes(1)
    expect(revalidate.mock.calls[0][1]).toEqual([publishTags.tours(A), publishTags.tour(TOUR)])
  })
  it('a change for a company no longer enrolled is settled without a refresh', async () => {
    const { store, state } = memoryStore(enrolled(A), [row({ tenant_id: B })])
    const revalidate = vi.fn(async () => {})
    await runSyncCycle({ store, revalidate, alert: vi.fn(async () => {}), now: () => NOW })
    expect(revalidate).not.toHaveBeenCalled()
    expect(state.rows[0].processed).toBe(true)
  })
})

// ---------- 3. malformed payloads are rejected and visible ----------

describe('a broken payload', () => {
  it('a product change with no tour id is set aside with its reason, and the company shows failing', async () => {
    const { store, state } = memoryStore(enrolled(A), [row({ table_name: 'tour_days', template_id: null })])
    const revalidate = vi.fn(async () => {})
    const report = await runSyncCycle({ store, revalidate, alert: vi.fn(async () => {}), now: () => NOW })
    expect(report.success).toBe(false)
    expect(report.setAside).toBe(1)
    expect(state.rows[0].processed).toBe(true) // not retried forever…
    expect(state.rows[0].note).toMatch(/product\.updated: invalid payload \(templateId: a tour, day or variation change must name its tour/) // …but kept, with why
    expect(state.companies[0].health.status).toBe('failing')
    expect(state.companies[0].health.last_error).toMatch(/could not be read/)
    expect(revalidate).not.toHaveBeenCalled()
  })
  it('an unknown table is set aside the same way', async () => {
    const { store, state } = memoryStore(enrolled(A), [row({ table_name: 'bookings' })])
    await runSyncCycle({ store, revalidate: vi.fn(async () => {}), alert: vi.fn(async () => {}), now: () => NOW })
    expect(state.rows[0].note).toBe('no event for table "bookings"')
  })
})

// ---------- delivery failures, lag, alerts ----------

describe('when the renderer does not confirm', () => {
  it('changes stay waiting, are counted, and the company shows failing — alerted from the second failure', async () => {
    const { store, state } = memoryStore(enrolled(A), [row({ table_name: 'guide_rates', template_id: null })])
    const revalidate = vi.fn(async () => { throw new Error('renderer answered HTTP 502') })
    const alert = vi.fn<(a: SyncAlert) => Promise<void>>(async () => {})

    let t = NOW.getTime()
    const r1 = await runSyncCycle({ store, revalidate, alert, now: () => new Date(t) })
    expect(r1.success).toBe(false)
    expect(state.rows[0]).toMatchObject({ processed: false, attempts: 1, error: 'renderer answered HTTP 502' })
    expect(state.companies[0].health).toMatchObject({ status: 'failing', consecutive_failures: 1, last_error: 'renderer answered HTTP 502' })
    expect(alert).not.toHaveBeenCalled() // one blip does not wake anyone

    t += 300_000
    await runSyncCycle({ store, revalidate, alert, now: () => new Date(t) })
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][0]).toMatchObject({ tenantId: A, kind: 'problem', status: 'failing', companyName: 'Co a' })

    t += 300_000
    await runSyncCycle({ store, revalidate, alert, now: () => new Date(t) })
    expect(alert).toHaveBeenCalledTimes(1) // not every five minutes

    revalidate.mockImplementation(async () => {})
    t += 300_000
    const r4 = await runSyncCycle({ store, revalidate, alert, now: () => new Date(t) })
    expect(r4.success).toBe(true)
    expect(state.rows[0].processed).toBe(true)
    expect(state.companies[0].health.status).toBe('ok')
    expect(alert).toHaveBeenCalledTimes(2)
    expect(alert.mock.calls[1][0]).toMatchObject({ kind: 'recovered' })
  })

  it('a shared row is settled only when every company it reached was refreshed', async () => {
    const { store, state } = memoryStore(enrolled(A, B), [row({ tenant_id: null, table_name: 'exchange_rates', template_id: null })])
    const revalidate = vi.fn(async (tenant: string) => { if (tenant === B) throw new Error('down') })
    await runSyncCycle({ store, revalidate, alert: vi.fn(async () => {}), now: () => NOW })
    expect(state.rows[0].processed).toBe(false)
    expect(state.companies.find(c => c.health.tenant_id === A)!.health.status).toBe('ok')
    expect(state.companies.find(c => c.health.tenant_id === B)!.health.status).toBe('failing')
  })

  it('an alert channel failing does not lose the health record', async () => {
    const { store, state } = memoryStore(
      [{ health: health(A, { status: 'failing', consecutive_failures: 1 }), companyName: 'Co' }],
      [row({ table_name: 'guide_rates', template_id: null })])
    const alert = vi.fn(async () => { throw new Error('webhook down') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await runSyncCycle({ store, revalidate: vi.fn(async () => { throw new Error('x') }), alert, now: () => NOW })
    expect(alert).toHaveBeenCalled()
    expect(state.companies[0].health).toMatchObject({ status: 'failing', alerted_status: 'failing' })
  })
})

describe('lag', () => {
  it('a change waiting longer than the window makes the company lagging, alerted at once', () => {
    const d = nextHealth(health(A), { error: null, lagSeconds: LAG_LIMIT_SECONDS + 1, lastEventAt: null }, NOW)
    expect(d.next.status).toBe('lagging')
    expect(d.alert).toEqual({ kind: 'problem', status: 'lagging' })
  })
  it('a full batch with old changes unread behind it counts as lagging', async () => {
    const old = new Date(NOW.getTime() - (LAG_LIMIT_SECONDS + 60) * 1000).toISOString()
    const rows = [1, 2, 3].map(() => row({ table_name: 'meal_rates', template_id: null, changed_at: old }))
    const { store, state } = memoryStore(enrolled(A), rows)
    await runSyncCycle({ store, revalidate: vi.fn(async () => {}), alert: vi.fn(async () => {}), now: () => NOW, batchSize: 2 })
    expect(state.companies[0].health.status).toBe('lagging')
  })
  it('a long-standing problem is re-alerted after six hours', () => {
    const prev = health(A, { status: 'lagging', alerted_status: 'lagging', alerted_at: new Date(NOW.getTime() - REALERT_AFTER_MS).toISOString() })
    expect(nextHealth(prev, { error: null, lagSeconds: LAG_LIMIT_SECONDS + 1, lastEventAt: null }, NOW).alert).not.toBeNull()
  })
})

describe('the watchdog (a stopped worker cannot report itself)', () => {
  it('marks every enrolled company stalled once the worker is quiet past the limit, alerting once', async () => {
    const quiet = new Date(NOW.getTime() - (STALL_AFTER_SECONDS + 1) * 1000).toISOString()
    const { store, state } = memoryStore(enrolled(A, B), [], quiet)
    const alert = vi.fn(async () => {})
    expect(await watchPublishWorker({ store, alert, now: () => NOW })).toEqual({ stalled: true, alerts: 2 })
    expect(state.companies.map(c => c.health.status)).toEqual(['stalled', 'stalled'])
    expect(state.companies[0].health.last_error).toContain(quiet)
    await watchPublishWorker({ store, alert, now: () => new Date(NOW.getTime() + 300_000) })
    expect(alert).toHaveBeenCalledTimes(2)
  })
  it('a worker that never ran is stalled once enrolment is older than the limit', async () => {
    const { store, state } = memoryStore(enrolled(A), [], null)
    await watchPublishWorker({ store, alert: vi.fn(async () => {}), now: () => NOW })
    expect(state.companies[0].health).toMatchObject({ status: 'stalled', last_error: 'the sync worker has never run' })
  })
  it('a running worker is left alone, and nobody enrolled means nothing to watch', async () => {
    const { store } = memoryStore(enrolled(A), [], NOW.toISOString())
    expect((await watchPublishWorker({ store, alert: vi.fn(), now: () => NOW })).stalled).toBe(false)
    const empty = memoryStore([], [], null)
    expect((await watchPublishWorker({ store: empty.store, alert: vi.fn(), now: () => NOW })).stalled).toBe(false)
  })
  it('the worker coming back clears stalled and announces recovery', async () => {
    const { store, state } = memoryStore([{ health: health(A, { status: 'stalled', alerted_status: 'stalled', alerted_at: NOW.toISOString() }), companyName: 'Co' }], [])
    const alert = vi.fn(async () => {})
    await runSyncCycle({ store, revalidate: vi.fn(), alert, now: () => NOW })
    expect(state.companies[0].health.status).toBe('ok')
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'recovered' }))
  })
})

// ---------- 6. the renderer's side of the wire ----------

describe('revalidation over the wire', () => {
  const secret = 'test-secret'
  const secrets = [{ label: 'current' as const, secret }]

  it('the worker\'s signed request is accepted and every tag revalidated', async () => {
    const revalidated: string[] = []
    let seen: { url: string; init: RequestInit } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      const res = await handleRevalidateRequest({
        rawBody: init.body as string,
        signatureHeader: (init.headers as Record<string, string>)['x-autoura-signature'],
        secrets, revalidateTag: t => { revalidated.push(t) },
      })
      return new Response(JSON.stringify(res.body), { status: res.status })
    }) as unknown as typeof fetch
    const revalidate = createRevalidator({ rendererUrl: 'https://sites.test/', secret, fetchImpl })
    await revalidate(A, [publishTags.tours(A), publishTags.site(A), publishTags.tours(A)])
    expect(seen!.url).toBe(`https://sites.test${REVALIDATE_PATH}`)
    expect(revalidated).toEqual([publishTags.tours(A), publishTags.site(A)])
  })

  it('unsigned, tampered or unconfigured requests revalidate nothing', async () => {
    const revalidateTag = vi.fn()
    const body = JSON.stringify({ tenantId: A, tags: ['x'], sentAt: NOW.toISOString() })
    const t = Math.floor(Date.now() / 1000)
    expect((await handleRevalidateRequest({ rawBody: body, signatureHeader: null, secrets, revalidateTag })).status).toBe(401)
    const signed = buildSignatureHeader(secret, t, body)
    expect((await handleRevalidateRequest({ rawBody: body.replace('"x"', '"y"'), signatureHeader: signed, secrets, revalidateTag })).status).toBe(401)
    expect((await handleRevalidateRequest({ rawBody: body, signatureHeader: signed, secrets: [], revalidateTag })).status).toBe(500)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect((await handleRevalidateRequest({ rawBody: body, signatureHeader: signed, secrets, revalidateTag })).status).toBe(200)
  })

  it('"sent" is not "done": a renderer that confirms fewer tags, or errors, is a failure', async () => {
    const answering = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    await expect(createRevalidator({ rendererUrl: 'https://s', secret, fetchImpl: answering(200, { ok: true, revalidated: 1 }) })(A, ['a', 'b']))
      .rejects.toThrow('renderer revalidated 1 of 2 tags')
    await expect(createRevalidator({ rendererUrl: 'https://s', secret, fetchImpl: answering(200, {}) })(A, ['a']))
      .rejects.toThrow('renderer gave no revalidation count')
    await expect(createRevalidator({ rendererUrl: 'https://s', secret, fetchImpl: answering(503, { error: 'busy' }) })(A, ['a']))
      .rejects.toThrow('renderer answered HTTP 503: busy')
    await expect(createRevalidator({ rendererUrl: undefined, secret })(A, ['a'])).rejects.toThrow(/PUBLISH_RENDERER_URL/)
    await expect(createRevalidator({ rendererUrl: 'https://s', secret: undefined })(A, ['a'])).rejects.toThrow(/PUBLISH_REVALIDATE_SECRET/)
  })
})
