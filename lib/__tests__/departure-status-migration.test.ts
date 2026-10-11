import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 409 on a real Postgres: a departure's status follows its
// bookings back down, and Draft / Cancelled are never overridden.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/409_departure_status_follows_bookings.sql'), 'utf8')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table tour_departures(
      id text primary key, status varchar(20) not null default 'open',
      max_pax int not null, min_pax int not null default 1, booked_pax int not null default 0,
      is_guaranteed boolean not null default false);
    create or replace function update_departure_status() returns trigger as $$ begin return new; end; $$ language plpgsql;
    create trigger auto_update_departure_status before update on tour_departures
      for each row when (old.booked_pax is distinct from new.booked_pax) execute function update_departure_status();`)
  await db.exec(mig)
  await db.exec(mig)
}, 60_000)

const statusAfter = async (id: string, booked: number) => {
  await db.query(`update tour_departures set booked_pax = $2 where id = $1`, [id, booked])
  const r = await db.query<{ status: string }>(`select status from tour_departures where id = $1`, [id])
  return r.rows[0].status
}

describe('409_departure_status_follows_bookings', () => {
  it('Full when sold out, back to Limited and Open as bookings drop', async () => {
    await db.query(`insert into tour_departures(id, max_pax) values ('a', 10)`)
    expect(await statusAfter('a', 10)).toBe('full')
    expect(await statusAfter('a', 8)).toBe('limited')
    expect(await statusAfter('a', 3)).toBe('open')
  })

  it('a guaranteed departure that reaches its minimum is Guaranteed', async () => {
    await db.query(`insert into tour_departures(id, max_pax, min_pax, is_guaranteed) values ('g', 20, 4, true)`)
    expect(await statusAfter('g', 4)).toBe('guaranteed')
  })

  it('Draft and Cancelled are never overridden', async () => {
    await db.query(`insert into tour_departures(id, max_pax, status) values ('c', 10, 'cancelled'), ('d', 10, 'draft')`)
    expect(await statusAfter('c', 10)).toBe('cancelled')
    expect(await statusAfter('d', 10)).toBe('draft')
  })
})
