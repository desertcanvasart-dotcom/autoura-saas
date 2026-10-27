import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { WATCHED_TABLES, RATE_TABLES, publishTags, type ChangeRow } from '@/lib/publish/sync/events'
import { runSyncCycle } from '@/lib/publish/sync/worker'
import type { HealthRow } from '@/lib/publish/sync/health'
import type { SyncStore } from '@/lib/publish/sync/store'

// ============================================================================
// Publish sync, database half (docs/publish/PLAN.md §5.3, items 4 and 5).
// Runs the real migration 439 on Postgres (PGlite), with the real rate-audit
// trigger from migration 252 in front of it:
//   - a write to every watched table, and a rate change through the audit log,
//     lands in publish_change_log — for enrolled companies only
//   - the trigger list here, in the code (WATCHED_TABLES) and in 252's audit
//     list (RATE_TABLES) cannot drift apart
//   - a broken feed never blocks the write it observes
//   - end to end: a hotel rate changes → one worker cycle → the company's tour
//     pages are revalidated and its health says so
// ============================================================================

const MIG = (f: string) => fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', f), 'utf8')
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const TOUR = '00000000-0000-4000-8000-0000000000f1'

let db: PGlite

/** The rate-audit trigger function exactly as migration 252 defines it. */
function rateAuditFunction(): string {
  const sql = MIG('252_remaining_reference_tables.sql')
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION rate_audit_trigger()')
  const end = sql.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER;', start)
  expect(start, 'migration 252 still defines rate_audit_trigger').toBeGreaterThan(-1)
  return sql.slice(start, end + '$$ LANGUAGE plpgsql SECURITY DEFINER;'.length)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function public.get_user_tenant_id() returns uuid language sql as 'select null::uuid';
    create table tenants(id uuid primary key, company_name text, license_number text,
      stripe_customer_id text, updated_at timestamptz);
    create table tour_templates(id uuid primary key default gen_random_uuid(), tenant_id uuid,
      template_name text, is_active boolean default true, updated_at timestamptz);
    create table tour_variations(id uuid primary key default gen_random_uuid(), tenant_id uuid, template_id uuid, tier text);
    create table tour_days(id uuid primary key default gen_random_uuid(), tenant_id uuid, template_id uuid, city text);
    create table tour_departures(id uuid primary key default gen_random_uuid(), tenant_id uuid, template_id uuid, booked_pax int);
    create table tour_day_activities(id uuid primary key default gen_random_uuid(), tenant_id uuid, template_id uuid, activity_name text);
    create table tour_variation_services(id uuid primary key default gen_random_uuid(), tenant_id uuid, variation_id uuid, optional_price_override numeric);
    create table variation_services(id uuid primary key default gen_random_uuid(), tenant_id uuid, variation_id uuid, service_name text);
    create table variation_pricing(id uuid primary key default gen_random_uuid(), tenant_id uuid, variation_id uuid, price_per_person numeric);
    create table variation_daily_itinerary(id uuid primary key default gen_random_uuid(), tenant_id uuid, variation_id uuid, title text);
    create table exchange_rates(id uuid primary key default gen_random_uuid(), tenant_id uuid, target_currency text, rate numeric);
    create table rate_audit_log(id uuid primary key default gen_random_uuid(), table_name text not null,
      record_id uuid, action text not null, changed_by uuid, tenant_id uuid, old_data jsonb, new_data jsonb,
      changed_at timestamptz not null default now());
    create table accommodation_rates(id uuid primary key default gen_random_uuid(), tenant_id uuid,
      hotel_name text, ppd_eur numeric, updated_at timestamptz);
    create table job_runs(id uuid primary key default gen_random_uuid(), job_name text, started_at timestamptz);
    insert into tenants(id, company_name) values ('${A}', 'Sillage'), ('${B}', 'Not on Publish');
  `)
  await db.exec(rateAuditFunction())
  await db.exec(`create trigger audit_accommodation_rates after insert or update or delete on accommodation_rates
    for each row execute function rate_audit_trigger();`)
  await db.exec(MIG('439_publish_sync_foundation.sql'))
  await db.exec(MIG('439_publish_sync_foundation.sql')) // idempotent: a second run is harmless
  await db.exec(`insert into publish_sync_health(tenant_id) values ('${A}')`)
}, 60_000)

async function changes(): Promise<Array<{ tenant_id: string | null; table_name: string; op: string; template_id: string | null; changed_fields: string[]; is_active: boolean | null }>> {
  const r = await db.query(`select tenant_id, table_name, op, template_id, changed_fields, is_active from publish_change_log where processed_at is null order by id`)
  return r.rows as never
}
const clear = () => db.exec('delete from publish_change_log')

// ---------- 4. the triggers ----------

describe('migration 439 triggers', () => {
  it('the tables it watches are exactly WATCHED_TABLES, plus the rate audit log', async () => {
    const r = await db.query<{ t: string; f: string }>(`
      select c.relname as t, p.proname as f from pg_trigger g
        join pg_class c on c.oid = g.tgrelid join pg_proc p on p.oid = g.tgfoid
       where p.proname in ('publish_record_change', 'publish_record_rate_change') and not g.tgisinternal`)
    expect(r.rows.filter(x => x.f === 'publish_record_change').map(x => x.t).sort()).toEqual([...WATCHED_TABLES].sort())
    expect(r.rows.filter(x => x.f === 'publish_record_rate_change').map(x => x.t)).toEqual(['rate_audit_log'])
  })

  it('RATE_TABLES is migration 252\'s audit list — a rate table added there must be added here', () => {
    const sql = MIG('252_remaining_reference_tables.sql')
    const list = sql.slice(sql.indexOf('FOREACH t IN ARRAY ARRAY['), sql.indexOf('LOOP', sql.indexOf('FOREACH t IN ARRAY ARRAY[')))
    const tables = [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()
    expect(tables).toEqual([...RATE_TABLES].sort())
  })

  it('product, departure, company and FX writes are logged with the tour they belong to', async () => {
    await clear()
    await db.exec(`
      insert into tour_templates(id, tenant_id, template_name) values ('${TOUR}', '${A}', 'Nile classic');
      insert into tour_days(tenant_id, template_id, city) values ('${A}', '${TOUR}', 'Luxor');
      insert into tour_variations(tenant_id, template_id, tier) values ('${A}', '${TOUR}', 'deluxe');
      insert into tour_departures(tenant_id, template_id, booked_pax) values ('${A}', '${TOUR}', 3);
      update tenants set license_number = 'ETAA-1' where id = '${A}';
      insert into exchange_rates(tenant_id, target_currency, rate) values ('${A}', 'USD', 1.08);
    `)
    expect(await changes()).toEqual([
      { tenant_id: A, table_name: 'tour_templates', op: 'INSERT', template_id: TOUR, changed_fields: ['id', 'is_active', 'template_name', 'tenant_id'], is_active: true },
      { tenant_id: A, table_name: 'tour_days', op: 'INSERT', template_id: TOUR, changed_fields: ['city', 'id', 'template_id', 'tenant_id'], is_active: null },
      { tenant_id: A, table_name: 'tour_variations', op: 'INSERT', template_id: TOUR, changed_fields: ['id', 'template_id', 'tenant_id', 'tier'], is_active: null },
      { tenant_id: A, table_name: 'tour_departures', op: 'INSERT', template_id: TOUR, changed_fields: ['booked_pax', 'id', 'template_id', 'tenant_id'], is_active: null },
      { tenant_id: A, table_name: 'tenants', op: 'UPDATE', template_id: null, changed_fields: ['license_number'], is_active: null },
      { tenant_id: A, table_name: 'exchange_rates', op: 'INSERT', template_id: null, changed_fields: ['id', 'rate', 'target_currency', 'tenant_id'], is_active: null },
    ])
  })

  it('a variation-level change finds its tour through the variation — or names none once the variation is gone', async () => {
    await clear()
    const v = (await db.query<{ id: string }>(`select id from tour_variations where template_id = '${TOUR}' limit 1`)).rows[0].id
    await db.exec(`
      insert into tour_variation_services(tenant_id, variation_id, optional_price_override) values ('${A}', '${v}', 40);
      insert into variation_pricing(tenant_id, variation_id, price_per_person) values ('${A}', '${v}', 900);
      delete from tour_variations where id = '${v}';
      delete from variation_pricing where variation_id = '${v}';
    `)
    expect((await changes()).map(r => [r.table_name, r.op, r.template_id])).toEqual([
      ['tour_variation_services', 'INSERT', TOUR],
      ['variation_pricing', 'INSERT', TOUR],
      ['tour_variations', 'DELETE', TOUR],
      ['variation_pricing', 'DELETE', null],
    ])
  })

  it('switching a tour off records is_active = false; deleting records the old row', async () => {
    await clear()
    await db.exec(`update tour_templates set is_active = false where id = '${TOUR}'`)
    await db.exec(`delete from tour_days where template_id = '${TOUR}'`)
    const rows = await changes()
    expect(rows[0]).toMatchObject({ table_name: 'tour_templates', op: 'UPDATE', changed_fields: ['is_active'], is_active: false })
    expect(rows[1]).toMatchObject({ table_name: 'tour_days', op: 'DELETE', template_id: TOUR })
  })

  it('a rate change reaches the log through the existing audit trigger, naming the rate table', async () => {
    await clear()
    await db.exec(`insert into accommodation_rates(tenant_id, hotel_name, ppd_eur) values ('${A}', 'Winter Palace', 120)`)
    await db.exec(`update accommodation_rates set ppd_eur = 135 where hotel_name = 'Winter Palace'`)
    const rows = await changes()
    expect(rows.map(r => [r.table_name, r.op])).toEqual([['accommodation_rates', 'INSERT'], ['accommodation_rates', 'UPDATE']])
    expect(rows[1].changed_fields).toEqual(['ppd_eur'])
  })

  it('a shared (company-less) rate is logged while anyone is enrolled', async () => {
    await clear()
    await db.exec(`insert into exchange_rates(tenant_id, target_currency, rate) values (null, 'GBP', 0.85)`)
    expect((await changes()).map(r => r.tenant_id)).toEqual([null])
  })

  it('nothing is logged for a company not on Publish, nor for an edit that only touched timestamps', async () => {
    await clear()
    await db.exec(`
      insert into tour_templates(tenant_id, template_name) values ('${B}', 'Elsewhere');
      insert into accommodation_rates(tenant_id, hotel_name, ppd_eur) values ('${B}', 'Other', 50);
      update tour_templates set updated_at = now() where id = '${TOUR}';
    `)
    expect(await changes()).toEqual([])
  })

  it('a broken feed never blocks the write it watches', async () => {
    await clear()
    await db.exec('alter table publish_change_log rename to publish_change_log_gone')
    try {
      await db.exec(`update tour_templates set template_name = 'Still saves' where id = '${TOUR}'`)
      await db.exec(`update accommodation_rates set ppd_eur = 140 where hotel_name = 'Winter Palace'`)
      const r = await db.query<{ template_name: string }>(`select template_name from tour_templates where id = '${TOUR}'`)
      expect(r.rows[0].template_name).toBe('Still saves')
    } finally {
      await db.exec('alter table publish_change_log_gone rename to publish_change_log')
    }
  })

  it('browser roles can neither read the feed nor write health', async () => {
    const grants = await db.query<{ grantee: string; table_name: string; privilege_type: string }>(`
      select grantee, table_name, privilege_type from information_schema.role_table_grants
       where table_name in ('publish_change_log', 'publish_sync_health') and grantee in ('anon', 'authenticated')`)
    expect(grants.rows).toEqual([{ grantee: 'authenticated', table_name: 'publish_sync_health', privilege_type: 'SELECT' }])
  })
})

// ---------- 5. end to end on Postgres ----------

/** SyncStore over PGlite, matching supabaseSyncStore query for query. */
function pgliteStore(): SyncStore {
  return {
    async enrolled() {
      const r = await db.query(`select h.*, t.company_name from publish_sync_health h join tenants t on t.id = h.tenant_id`)
      return (r.rows as Array<Record<string, unknown>>).map(({ company_name, ...h }) => ({
        health: normalizeHealth(h), companyName: company_name as string,
      }))
    },
    async pending(limit) {
      const r = await db.query(`select id::int, tenant_id, table_name, record_id, op, template_id, changed_fields, is_active,
        changed_at, attempts from publish_change_log where processed_at is null order by id limit $1`, [limit])
      return (r.rows as Array<Record<string, unknown>>).map(x => ({ ...x, changed_at: (x.changed_at as Date).toISOString() })) as ChangeRow[]
    },
    async markProcessed(ids, note) {
      if (ids.length) await db.query(`update publish_change_log set processed_at = now(), error = $2 where id = any($1::bigint[])`, [ids, note ?? null])
    },
    async markFailed(rows, error) {
      await db.query(`update publish_change_log set attempts = attempts + 1, error = $2 where id = any($1::bigint[])`, [rows.map(r => r.id), error])
    },
    async saveHealth(rows) {
      for (const h of rows) {
        await db.query(`update publish_sync_health set status=$2, last_event_at=$3, last_success_at=$4, last_failure_at=$5,
          last_error=$6, consecutive_failures=$7, lag_seconds=$8, alerted_status=$9, alerted_at=$10, updated_at=$11 where tenant_id=$1`,
        [h.tenant_id, h.status, h.last_event_at, h.last_success_at, h.last_failure_at, h.last_error, h.consecutive_failures,
          h.lag_seconds, h.alerted_status, h.alerted_at, h.updated_at])
      }
    },
    async lastWorkerRunAt() {
      const r = await db.query<{ s: Date }>(`select max(started_at) s from job_runs where job_name = 'publish-sync'`)
      return r.rows[0]?.s ? r.rows[0].s.toISOString() : null
    },
    async pruneProcessed(before) {
      await db.query(`delete from publish_change_log where processed_at is not null and processed_at < $1`, [before.toISOString()])
    },
  }
}
function normalizeHealth(h: Record<string, unknown>): HealthRow {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null))
  return {
    ...(h as unknown as HealthRow),
    enrolled_at: iso(h.enrolled_at)!, last_event_at: iso(h.last_event_at), last_success_at: iso(h.last_success_at),
    last_failure_at: iso(h.last_failure_at), alerted_at: iso(h.alerted_at), updated_at: iso(h.updated_at)!,
  }
}

describe('end to end: a rate changes, the pages are refreshed', () => {
  it('one hotel price edit → one cycle → the company\'s tour pages revalidated, the change settled, health ok', async () => {
    await clear()
    await db.exec(`update accommodation_rates set ppd_eur = 150 where hotel_name = 'Winter Palace'`)
    const revalidate = vi.fn(async () => {})
    const report = await runSyncCycle({ store: pgliteStore(), revalidate, alert: vi.fn(async () => {}) })

    expect(report).toMatchObject({ success: true, changes: 1, refreshed: 1 })
    expect(revalidate).toHaveBeenCalledWith(A, [publishTags.tours(A)])
    expect((await db.query(`select count(*)::int n from publish_change_log where processed_at is null`)).rows[0]).toEqual({ n: 0 })
    const h = (await db.query<{ status: string; last_success_at: Date | null; last_event_at: Date | null }>(
      `select status, last_success_at, last_event_at from publish_sync_health where tenant_id = '${A}'`)).rows[0]
    expect(h.status).toBe('ok')
    expect(h.last_success_at).not.toBeNull()
    expect(h.last_event_at).not.toBeNull()
  })

  it('renderer down → the change waits with its reason and the company is failing; back up → settled and ok', async () => {
    await clear()
    await db.exec(`update tour_days set city = 'Aswan' where template_id = '${TOUR}'`)
    await db.exec(`insert into tour_days(tenant_id, template_id, city) values ('${A}', '${TOUR}', 'Edfu')`)
    const alert = vi.fn(async () => {})

    await runSyncCycle({ store: pgliteStore(), revalidate: vi.fn(async () => { throw new Error('renderer unreachable: ECONNREFUSED') }), alert })
    const waiting = (await db.query<{ attempts: number; error: string }>(`select attempts, error from publish_change_log where processed_at is null`)).rows
    expect(waiting).toEqual([{ attempts: 1, error: 'renderer unreachable: ECONNREFUSED' }])
    expect((await db.query(`select status, consecutive_failures from publish_sync_health where tenant_id = '${A}'`)).rows[0])
      .toEqual({ status: 'failing', consecutive_failures: 1 })

    const revalidate = vi.fn(async () => {})
    await runSyncCycle({ store: pgliteStore(), revalidate, alert })
    expect(revalidate).toHaveBeenCalledWith(A, [publishTags.tour(TOUR), publishTags.tours(A)])
    expect((await db.query(`select status, consecutive_failures from publish_sync_health where tenant_id = '${A}'`)).rows[0])
      .toEqual({ status: 'ok', consecutive_failures: 0 })
  })
})
