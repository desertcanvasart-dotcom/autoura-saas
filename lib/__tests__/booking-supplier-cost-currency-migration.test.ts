import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 439 on a real Postgres: booking_supplier_status.cost_currency,
// and the backfill of unconfirmed rows whose lines say the supplier's own
// currency (per-unit supplier_cost_original × quantity, or total ÷ rate once
// edited) — and nothing else. Safe to run twice.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/439_booking_supplier_cost_currency.sql'), 'utf8')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table itineraries(id text primary key, currency text, start_date date);
    create table bookings(id text primary key, tenant_id text, itinerary_id text, start_date date, currency text);
    create table itinerary_days(id text primary key, itinerary_id text, day_number int, date date);
    create table itinerary_services(
      id text primary key, itinerary_id text, itinerary_day_id text, day_id text,
      supplier_id text, supplier_name text, service_name text, service_type text, description text,
      quantity int, total_cost numeric(10,2),
      supplier_currency text default 'EUR', supplier_cost_original numeric(12,2), exchange_rate_used numeric(12,6));
    create table booking_supplier_status(
      id text primary key, tenant_id text, booking_id text, supplier_id text, supplier_type varchar(50),
      supplier_name varchar(255), service_date date, quoted_cost numeric(12,2), confirmed_cost numeric(12,2),
      status varchar(30) default 'pending');

    insert into itineraries values ('it1', 'JPY', '2026-11-01');
    insert into bookings values ('b1', 't1', 'it1', '2026-11-01', 'JPY');
    insert into itinerary_days values ('d1', 'it1', 1, null), ('d2', 'it1', 2, '2026-11-02'), ('d3', 'it1', 3, null);
    insert into itinerary_services values
      -- guide: 2 lines, EGP, per-unit originals current → EGP 3,500
      ('s1', 'it1', 'd1', null, 'g1', 'Ahmed', 'Guide', 'guide', null, 1, 9000, 'EGP', 3000, 3),
      ('s2', 'it1', null, 'd1', 'g1', 'Ahmed', 'Guide', 'guide', null, 1, 1500, 'EGP', 500, 3),
      -- grid cruise (saved as accommodation), 2 pax at USD 1,000 → USD 2,000
      ('s3', 'it1', 'd2', null, null, 'MS Nile', 'MS Nile', 'accommodation', '[pricing-grid:cruise] MS Nile', 2, 300000, 'USD', 1000, 150),
      -- hotel edited after pricing: total moved, original stale → total ÷ rate = EGP 22,500
      ('s4', 'it1', 'd3', null, 'h1', 'Hotel', 'Hotel', 'hotel', null, 1, 67500, 'EGP', 15000, 3),
      -- confirmed guide: never touched
      ('s5', 'it1', 'd3', null, 'g2', 'Mona', 'Guide', 'guide', null, 1, 3000, 'EGP', 1000, 3),
      -- transport with no rate (the grid's lines today): stays in the trip currency
      ('s6', 'it1', 'd3', null, 't1', 'Car', 'Car', 'transport', null, 1, 5000, 'EUR', null, null),
      -- restaurant whose row was edited by hand since: stays
      ('s7', 'it1', 'd3', null, 'r1', 'Sofra', 'Lunch', 'meal', null, 2, 4000, 'EGP', 1000, 2);
    insert into booking_supplier_status values
      ('r-guide', 't1', 'b1', 'g1', 'guide', 'Ahmed', '2026-11-01', 10500, null, 'pending'),
      ('r-cruise', 't1', 'b1', null, 'cruise', 'MS Nile', '2026-11-02', 300000, null, 'contacted'),
      ('r-hotel', 't1', 'b1', 'h1', 'hotel', 'Hotel', '2026-11-03', 67500, null, 'pending'),
      ('r-confirmed', 't1', 'b1', 'g2', 'guide', 'Mona', '2026-11-03', 3000, 3000, 'confirmed'),
      ('r-car', 't1', 'b1', 't1', 'transport', 'Car', '2026-11-03', 5000, null, 'pending'),
      ('r-edited', 't1', 'b1', 'r1', 'restaurant', 'Sofra', '2026-11-03', 3500, null, 'pending'),
      ('r-hand', 't1', 'b1', null, 'other', 'Porter', null, 20, null, 'pending');`)
}, 60_000) // booting PGlite under a full parallel run can exceed the 10 s default

describe('439_booking_supplier_cost_currency', () => {
  it('adds cost_currency and backfills only safely derivable unconfirmed rows; replays cleanly', async () => {
    await db.exec(mig)
    await db.exec(mig)
    const col = await db.query(`select data_type from information_schema.columns
      where table_name = 'booking_supplier_status' and column_name = 'cost_currency'`)
    expect(col.rows).toEqual([{ data_type: 'text' }])

    const rows = await db.query<{ id: string; quoted_cost: string; cost_currency: string | null }>(
      `select id, quoted_cost::text, cost_currency from booking_supplier_status order by id`)
    expect(Object.fromEntries(rows.rows.map(r => [r.id, [r.quoted_cost, r.cost_currency]]))).toEqual({
      'r-guide': ['3500.00', 'EGP'],
      'r-cruise': ['2000.00', 'USD'],
      'r-hotel': ['22500.00', 'EGP'],
      'r-confirmed': ['3000.00', null],
      'r-car': ['5000.00', null],
      'r-edited': ['3500.00', null],
      'r-hand': ['20.00', null],
    })
  })
})
