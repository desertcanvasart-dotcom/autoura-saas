import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 463 on a real Postgres: the copies the #803 form fanned out (one
// row per city × language, codes BASE, BASE-2 …, one insert) become ONE price
// carrying the lists; anything pointing at a copy moves to the kept row; rows
// entered one by one are never merged; it replays cleanly.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/463_guide_price_many_cities_languages.sql'), 'utf8')

const T = '2026-11-11 19:51:07.812+00'
const row = (id: string, code: string, city: string | null, lang: string, extra: Partial<{ rate: number; created: string; tenant: string }> = {}) =>
  `('${id}', '${extra.tenant ?? '00000000-0000-0000-0000-00000000000a'}', '${code}', ${city === null ? 'null' : `'${city}'`}, '${lang}', 'egyptologist', 'spot', 'full_day', ${extra.rate ?? 5000}, ${extra.rate ?? 5000}, 'EGP', true, '${extra.created ?? T}', '00000000-0000-0000-0000-0000000000b1')`

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table guide_rates(
      id uuid primary key, tenant_id uuid, service_code text, city text, guide_language text,
      guide_type text, guide_mode text, tour_duration text, base_rate_eur numeric, base_rate_non_eur numeric,
      rate_currency text, is_active boolean, created_at timestamptz, supplier_id uuid,
      season text, rate_valid_from date, rate_valid_to date);
    create table itinerary_services(id serial primary key, rate_id uuid);
    create table tour_variation_services(id serial primary key, rate_id uuid);
    insert into guide_rates(id, tenant_id, service_code, city, guide_language, guide_type, guide_mode, tour_duration, base_rate_eur, base_rate_non_eur, rate_currency, is_active, created_at, supplier_id) values
      -- Ahmed: 3 cities, 1 language, one insert
      ${row('00000000-0000-0000-0000-000000000001', 'GD-2MVROB', 'Aswan', 'english')},
      ${row('00000000-0000-0000-0000-000000000002', 'GD-2MVROB-2', 'Edfu', 'english')},
      ${row('00000000-0000-0000-0000-000000000003', 'GD-2MVROB-3', 'Kom Ombo', 'english')},
      -- Elsamak: 2 cities x 2 languages
      ${row('00000000-0000-0000-0000-000000000011', 'GD-0S5KTE', 'Alexandria', 'spanish', { created: '2026-11-08 09:45:31+00' })},
      ${row('00000000-0000-0000-0000-000000000012', 'GD-0S5KTE-2', 'Cairo', 'spanish', { created: '2026-11-08 09:45:31+00' })},
      ${row('00000000-0000-0000-0000-000000000013', 'GD-0S5KTE-3', 'Alexandria', 'english', { created: '2026-11-08 09:45:31+00' })},
      ${row('00000000-0000-0000-0000-000000000014', 'GD-0S5KTE-4', 'Cairo', 'english', { created: '2026-11-08 09:45:31+00' })},
      -- A copy repriced since: the group is left alone
      ${row('00000000-0000-0000-0000-000000000021', 'GD-REPRCD', 'Cairo', 'english', { created: '2026-11-09 10:00:00+00' })},
      ${row('00000000-0000-0000-0000-000000000022', 'GD-REPRCD-2', 'Luxor', 'english', { created: '2026-11-09 10:00:00+00', rate: 6000 })},
      -- Entered one by one at the same price: never merged
      ${row('00000000-0000-0000-0000-000000000031', 'GD-ONEONE', 'Cairo', 'french', { created: '2026-10-01 10:00:00+00' })},
      ${row('00000000-0000-0000-0000-000000000032', 'GD-TWOTWO', 'Luxor', 'french', { created: '2026-10-01 10:00:00+00' })},
      -- An import batch with a shared prefix: not a fan-out
      ${row('00000000-0000-0000-0000-000000000041', 'GUIDE-TG-20260922-01', 'Cairo', 'dutch', { created: '2026-09-22 22:54:50+00' })},
      ${row('00000000-0000-0000-0000-000000000042', 'GUIDE-TG-20260922-02', 'Luxor', 'dutch', { created: '2026-09-22 22:54:50+00' })};
    insert into itinerary_services(rate_id) values ('00000000-0000-0000-0000-000000000003'), ('00000000-0000-0000-0000-000000000031');
    insert into tour_variation_services(rate_id) values ('00000000-0000-0000-0000-000000000014');`)
  await db.exec(mig)
  await db.exec(mig)
}, 60_000) // booting PGlite under a full parallel run can exceed the 10 s default

type Row = { service_code: string; city: string | null; other_cities: string[]; guide_language: string; other_languages: string[] }
const byCode = async (code: string) =>
  (await db.query<Row>(`select service_code, city, other_cities, guide_language, other_languages from guide_rates where service_code like $1 order by service_code`, [`${code}%`])).rows

describe('463_guide_price_many_cities_languages', () => {
  it('a fanned-out price becomes one row with every city', async () => {
    expect(await byCode('GD-2MVROB')).toEqual([
      { service_code: 'GD-2MVROB', city: 'Aswan', other_cities: ['Edfu', 'Kom Ombo'], guide_language: 'english', other_languages: [] },
    ])
  })

  it('cities × languages become one row with both lists', async () => {
    expect(await byCode('GD-0S5KTE')).toEqual([
      { service_code: 'GD-0S5KTE', city: 'Alexandria', other_cities: ['Cairo'], guide_language: 'spanish', other_languages: ['english'] },
    ])
  })

  it('whatever pointed at a copy now points at the kept price', async () => {
    const it = await db.query<{ rate_id: string }>('select rate_id from itinerary_services order by id')
    expect(it.rows.map(r => r.rate_id)).toEqual(['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031'])
    const tv = await db.query<{ rate_id: string }>('select rate_id from tour_variation_services')
    expect(tv.rows[0].rate_id).toBe('00000000-0000-0000-0000-000000000011')
  })

  it('leaves a repriced group, separate entries and import batches alone', async () => {
    expect((await byCode('GD-REPRCD')).length).toBe(2)
    expect((await byCode('GD-ONEONE')).length + (await byCode('GD-TWOTWO')).length).toBe(2)
    expect((await byCode('GUIDE-TG')).length).toBe(2)
  })

  it('an any-city price cannot list other cities', async () => {
    await expect(db.exec(`update guide_rates set city = null where service_code = 'GD-2MVROB'`)).rejects.toThrow()
    await db.exec(`update guide_rates set city = null where service_code = 'GD-ONEONE'`)
  })
})
