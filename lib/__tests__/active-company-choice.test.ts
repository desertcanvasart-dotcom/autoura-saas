import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// ============================================================================
// Migration 414 on a real (in-memory) Postgres: one login, several companies.
// ============================================================================

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const OWNER = '00000000-0000-0000-0000-00000000000a'
const SOLO = '00000000-0000-0000-0000-00000000000b'
const T2E = '11111111-0000-0000-0000-000000000001'
const SAWA = '22222222-0000-0000-0000-000000000002'
const SILLAGE = '33333333-0000-0000-0000-000000000003'
let db: PGlite

async function as(user: string, sql: string) {
  await db.exec(`select set_config('test.uid', '${user}', false)`)
  return (await db.query(sql)).rows
}
const current = async (user: string) => ((await as(user, 'select get_user_tenant_id() t'))[0] as { t: string | null }).t
const choose = (user: string, tenant: string | null) =>
  db.exec(`update user_profiles set active_tenant_id = ${tenant ? `'${tenant}'` : 'null'} where id = '${user}'`)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role authenticated;
    create table tenants(id uuid primary key);
    insert into tenants values ('${T2E}'), ('${SAWA}'), ('${SILLAGE}');
    create table user_profiles(id uuid primary key);
    insert into user_profiles values ('${OWNER}'), ('${SOLO}');
    create table tenant_members(id serial primary key, tenant_id uuid, user_id uuid, role text, status text, joined_at timestamptz);
    insert into tenant_members(tenant_id,user_id,role,status,joined_at) values
      ('${SAWA}','${OWNER}','owner','active','2026-09-18'),
      ('${T2E}','${OWNER}','manager','active','2026-09-24'),
      ('${SILLAGE}','${OWNER}','owner','deactivated','2026-07-01'),
      ('${T2E}','${SOLO}','member','active','2026-08-01');
  `)
  await db.exec(read('supabase/migrations/414_active_company_choice.sql'))
  // Idempotent: a second run changes nothing.
  await db.exec(read('supabase/migrations/414_active_company_choice.sql'))
})

describe('migration 414 — the company a person works in', () => {
  it('with no choice, it is the oldest active membership, as before', async () => {
    expect(await current(OWNER)).toBe(SAWA)
    expect(await current(SOLO)).toBe(T2E)
  })

  it('a chosen company is current while the person is an active member of it', async () => {
    await choose(OWNER, T2E)
    expect(await current(OWNER)).toBe(T2E)
    await choose(OWNER, SAWA)
    expect(await current(OWNER)).toBe(SAWA)
  })

  it('a company they are deactivated in, or never belonged to, is ignored', async () => {
    await choose(OWNER, SILLAGE)
    expect(await current(OWNER)).toBe(SAWA)
    await choose(SOLO, SAWA)
    expect(await current(SOLO)).toBe(T2E)
  })

  it('deactivation in the chosen company falls back to the next one', async () => {
    await choose(OWNER, T2E)
    await db.exec(`update tenant_members set status = 'deactivated' where tenant_id = '${T2E}' and user_id = '${OWNER}'`)
    expect(await current(OWNER)).toBe(SAWA)
  })

  it('deleting a company clears the choice', async () => {
    await db.exec(`insert into tenants values ('44444444-0000-0000-0000-000000000004')`)
    await choose(SOLO, '44444444-0000-0000-0000-000000000004')
    await db.exec(`delete from tenants where id = '44444444-0000-0000-0000-000000000004'`)
    const rows = (await db.query(`select active_tenant_id from user_profiles where id = '${SOLO}'`)).rows
    expect(rows).toEqual([{ active_tenant_id: null }])
  })
})

describe('the app side', () => {
  it('the switcher saves the choice only for an active membership', () => {
    const r = read('app/api/me/companies/route.ts')
    expect(r).toMatch(/You are not an active member of that company/)
    expect(r).toMatch(/\.eq\('status', 'active'\)/)
    expect(r).toMatch(/update\(\{ active_tenant_id: tenantId \}\)/)
  })

  it('accepting an invitation opens the new company instead of refusing it', () => {
    const r = read('app/api/invitations/accept/route.ts')
    expect(r).not.toMatch(/cannot switch between companies yet/)
    expect(r).toMatch(/active_tenant_id: invitation\.tenant_id/)
  })
})
