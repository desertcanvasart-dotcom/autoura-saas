import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 393 on a real Postgres: every existing airport / hotel assistance
// rate becomes "per group" (it prices exactly as before), only the three
// bases are accepted, and the migration replays cleanly.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/393_staff_rates_pricing_basis.sql'), 'utf8')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table airport_staff_rates(id serial primary key, airport_code text, rate_eur numeric);
    create table hotel_staff_rates(id serial primary key, service_type text, rate_eur numeric);
    insert into airport_staff_rates(airport_code, rate_eur) values ('ASW', 700);
    insert into hotel_staff_rates(service_type, rate_eur) values ('checkin_assist', 700);`)
  await db.exec(mig)
  await db.exec(mig)
}, 60_000) // booting PGlite under a full parallel run can exceed the 10 s default

describe('393_staff_rates_pricing_basis', () => {
  it('existing rates are per group, with no capacity', async () => {
    for (const t of ['airport_staff_rates', 'hotel_staff_rates']) {
      const { rows } = await db.query<{ pricing_type: string; max_capacity: number | null }>(`select pricing_type, max_capacity from ${t}`)
      expect(rows).toEqual([{ pricing_type: 'flat', max_capacity: null }])
    }
  })

  it('accepts the three bases and refuses anything else', async () => {
    await db.exec(`update airport_staff_rates set pricing_type = 'per_person'`)
    await db.exec(`update hotel_staff_rates set pricing_type = 'per_unit', max_capacity = 2`)
    await expect(db.exec(`update airport_staff_rates set pricing_type = 'per_bag'`)).rejects.toThrow()
    await expect(db.exec(`update hotel_staff_rates set max_capacity = 0`)).rejects.toThrow()
  })
})
