import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 469 on a real Postgres: each company sees only its own zones; a
// zone key is unique within its city (ignoring capitals); a city has at most
// one default zone.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/469_city_zones.sql'), 'utf8')

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const ADMIN_A = '00000000-0000-0000-0000-0000000000a1'
const ADMIN_B = '00000000-0000-0000-0000-0000000000b1'

async function as<T = Record<string, unknown>>(user: string, sql: string) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
  try {
    return (await db.query<T>(sql)).rows
  } finally {
    await db.exec('reset role;')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;

    create table tenants(id uuid primary key);
    create table tenant_members(user_id uuid, tenant_id uuid, role text, status text);
    insert into tenants values ('${A}'), ('${B}');
    insert into tenant_members values ('${ADMIN_A}', '${A}', 'admin', 'active'), ('${ADMIN_B}', '${B}', 'owner', 'active');

    create function get_user_tenant_id() returns uuid language sql stable security definer as
      $$ select tenant_id from tenant_members where user_id = auth.uid() limit 1 $$;
    grant execute on function get_user_tenant_id() to authenticated;`)
}, 60_000)

describe('469_city_zones', () => {
  it('replays cleanly', async () => {
    await db.exec(mig)
    await db.exec(mig)
    await db.exec('grant all on city_zones to authenticated;')
  })

  it('a company adds its own zones', async () => {
    await as(ADMIN_A, `insert into city_zones (tenant_id, city, key, label, is_default, rank) values
      ('${A}', 'Luxor', 'east_bank', 'East Bank', true, 1),
      ('${A}', 'Luxor', 'west_bank', 'West Bank', false, 2)`)
    const rows = await as<{ label: string }>(ADMIN_A, 'select label from city_zones order by rank')
    expect(rows.map(r => r.label)).toEqual(['East Bank', 'West Bank'])
  })

  it('another company sees none of them and cannot write into them', async () => {
    expect(await as(ADMIN_B, 'select * from city_zones')).toEqual([])
    await expect(as(ADMIN_B, `insert into city_zones (tenant_id, city, key, label) values ('${A}', 'Luxor', 'x', 'X')`)).rejects.toThrow()
  })

  it('a key is unique within its city, ignoring capitals', async () => {
    await expect(as(ADMIN_A, `insert into city_zones (tenant_id, city, key, label) values ('${A}', 'luxor ', 'west_bank', 'West Bank again')`)).rejects.toThrow(/city_zones_key_idx/)
    // The same key in another city is fine.
    await as(ADMIN_A, `insert into city_zones (tenant_id, city, key, label, is_default) values ('${A}', 'Aswan', 'west_bank', 'West Bank', true)`)
  })

  it('a city has at most one default', async () => {
    await expect(as(ADMIN_A, `insert into city_zones (tenant_id, city, key, label, is_default) values ('${A}', 'LUXOR', 'other', 'Other', true)`)).rejects.toThrow(/city_zones_one_default_idx/)
  })

  it('refuses a bad key or an empty name', async () => {
    await expect(as(ADMIN_A, `insert into city_zones (tenant_id, city, key, label) values ('${A}', 'Luxor', 'West Bank', 'x')`)).rejects.toThrow()
    await expect(as(ADMIN_A, `insert into city_zones (tenant_id, city, key, label) values ('${A}', 'Luxor', 'blank', '  ')`)).rejects.toThrow()
  })
})
