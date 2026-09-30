import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// ============================================================================
// save_pricing_grid_days (migration 391) on a real Postgres.
//
// The grid used to delete an itinerary's days, then insert day by day, only
// logging a failure and carrying on — a failure part-way left the itinerary
// missing days while the save answered success. And the day's type and
// overrides were never stored. Here: everything lands in one transaction,
// with the day's settings, and a failure anywhere leaves the previous days
// exactly as they were. Migration 385's day-link trigger runs as in prod.
// ============================================================================

const T = '00000000-0000-0000-0000-00000000000a'
const IT = '00000000-0000-0000-0000-0000000000b1'
let db: PGlite

const mig = (f: string) => fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', f), 'utf8')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role authenticated;
    create table itineraries(id uuid primary key, tenant_id uuid not null);
    create table itinerary_days(
      id uuid primary key default gen_random_uuid(),
      itinerary_id uuid not null references itineraries(id) on delete cascade,
      tenant_id uuid, day_number integer not null, date date, title varchar(255),
      description text, city varchar(100), overnight_city varchar(100));
    create table itinerary_services(
      id uuid primary key default gen_random_uuid(), itinerary_id uuid, tenant_id uuid,
      day_id uuid references itinerary_days(id) on delete cascade,
      itinerary_day_id uuid references itinerary_days(id) on delete cascade,
      service_type text, service_name text not null, description text,
      quantity integer default 1, unit_cost numeric(10,2), total_cost numeric(10,2),
      is_included boolean default true, client_price numeric default 0,
      rate_table text, rate_id uuid);`)
  await db.exec(mig('385_itinerary_services_one_day_link.sql'))
  await db.exec(mig('391_pricing_grid_day_components_atomic_save.sql'))
  await db.query(`insert into itineraries values ($1, $2)`, [IT, T])
}, 60_000) // booting PGlite under a full parallel run can exceed the 10 s default

const day = (n: number, extra: Record<string, unknown> = {}, services: Record<string, unknown>[] = []) => ({
  day_number: n, date: `2026-12-0${n}`, title: `Day ${n}`, description: '', city: 'Cairo', overnight_city: 'Cairo',
  day_type: 'tour', overnight: null, has_sightseeing: null, airport_arrival: null, airport_departure: null,
  hotel_check_in: null, hotel_check_out: null, intercity: null, services, ...extra,
})
const svc = (name: string, extra: Record<string, unknown> = {}) => ({
  service_type: 'transportation', service_name: name, description: `[pricing-grid:route] ${name}`,
  quantity: 1, unit_cost: 50, total_cost: 50, is_included: true, ...extra,
})

const save = (days: unknown[], itinerary = IT) =>
  db.query<{ days_inserted: number; services_inserted: number }>(
    `select * from save_pricing_grid_days($1, $2::jsonb)`, [itinerary, JSON.stringify(days)])

const daysNow = async () =>
  (await db.query<Record<string, unknown>>(
    `select day_number, day_type, intercity, has_sightseeing, overnight, tenant_id from itinerary_days
      where itinerary_id = $1 order by day_number`, [IT])).rows
const servicesNow = async () =>
  (await db.query<Record<string, unknown>>(
    `select s.service_name, s.day_id, s.itinerary_day_id, s.client_price, s.tenant_id, s.rate_table, s.rate_id, d.day_number
       from itinerary_services s join itinerary_days d on d.id = s.day_id
      where s.itinerary_id = $1 order by d.day_number, s.service_name`, [IT])).rows

beforeEach(async () => {
  await db.query(`delete from itinerary_days where itinerary_id = $1`, [IT])
})

describe('save_pricing_grid_days', () => {
  it('stores each day with its type and overrides, and its services, in one call', async () => {
    const rateId = '00000000-0000-0000-0000-0000000000c1'
    const res = await save([
      day(1, { day_type: 'arrival', overnight: true }, [svc('Airport transfer', { rate_table: 'transportation_rates', rate_id: rateId })]),
      day(2, { day_type: 'transfer', intercity: 'flight', has_sightseeing: true }, [svc('Van'), svc('Driver')]),
    ])
    expect(res.rows[0]).toEqual({ days_inserted: 2, services_inserted: 3 })
    expect(await daysNow()).toEqual([
      { day_number: 1, day_type: 'arrival', intercity: null, has_sightseeing: null, overnight: true, tenant_id: T },
      { day_number: 2, day_type: 'transfer', intercity: 'flight', has_sightseeing: true, overnight: null, tenant_id: T },
    ])
    const services = await servicesNow()
    expect(services).toHaveLength(3)
    for (const s of services) {
      // Both day columns (385), the itinerary's tenant, and NO client_price —
      // an unset client_price means cost × margin; 0 read as "sold for free".
      expect(s.day_id).toBe(s.itinerary_day_id)
      expect(s.client_price).toBeNull()
      expect(s.tenant_id).toBe(T)
    }
    expect(services[0]).toMatchObject({ service_name: 'Airport transfer', rate_table: 'transportation_rates', rate_id: rateId })
  })

  it('a re-save replaces the days and their services — nothing doubles', async () => {
    await save([day(1, {}, [svc('A')]), day(2, {}, [svc('B')])])
    await save([day(1, {}, [svc('C')])])
    expect((await daysNow()).map(d => d.day_number)).toEqual([1])
    expect((await servicesNow()).map(s => s.service_name)).toEqual(['C'])
  })

  it('a failure on a later day rolls EVERYTHING back — the previous days survive', async () => {
    await save([day(1, { day_type: 'arrival' }, [svc('Kept')])])
    await expect(save([
      day(1, {}, [svc('New one')]),
      day(2, { day_type: 'not-a-type' }),   // violates the day_type CHECK
    ])).rejects.toThrow(/day_type/)
    expect(await daysNow()).toEqual([
      { day_number: 1, day_type: 'arrival', intercity: null, has_sightseeing: null, overnight: null, tenant_id: T },
    ])
    expect((await servicesNow()).map(s => s.service_name)).toEqual(['Kept'])
  })

  it('a failing service also rolls back its day and every other day', async () => {
    await save([day(1, {}, [svc('Kept')])])
    await expect(save([day(1, {}, [svc('ok'), { ...svc('bad'), service_name: null }])])).rejects.toThrow()
    expect((await servicesNow()).map(s => s.service_name)).toEqual(['Kept'])
  })

  it('intercity is text — none, road and flight save; anything else is refused', async () => {
    await save([day(1, { intercity: 'none' }), day(2, { intercity: 'road' }), day(3, { intercity: 'flight' })])
    expect((await daysNow()).map(d => d.intercity)).toEqual(['none', 'road', 'flight'])
    await expect(save([day(1, { intercity: 'teleport' })])).rejects.toThrow(/intercity/)
  })

  it('an itinerary the caller cannot see is refused, not created', async () => {
    await expect(save([day(1)], '00000000-0000-0000-0000-00000000dead')).rejects.toThrow(/not found/)
  })
})
