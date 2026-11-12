import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 465 on a real Postgres: each company sees only its own blocked
// numbers; staff read them, owners/admins/managers block and unblock; a
// number is E.164 and blocked once per company.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/465_whatsapp_blocked_numbers.sql'), 'utf8')

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const BOSS = '00000000-0000-0000-0000-0000000000a1'
const STAFF = '00000000-0000-0000-0000-0000000000a2'
const OTHER_BOSS = '00000000-0000-0000-0000-0000000000b1'

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
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;

    create table tenants(id uuid primary key);
    create table tenant_members(user_id uuid, tenant_id uuid, role text, status text);
    insert into tenants values ('${A}'), ('${B}');
    insert into tenant_members values
      ('${BOSS}', '${A}', 'manager', 'active'), ('${STAFF}', '${A}', 'member', 'active'),
      ('${OTHER_BOSS}', '${B}', 'owner', 'active');

    -- Stand-ins for the app's two RLS helpers (migrations 002 / 030).
    create function get_user_tenant_id() returns uuid language sql stable security definer as
      $$ select tenant_id from tenant_members where user_id = auth.uid() limit 1 $$;
    create function user_has_role(required_roles text[]) returns boolean language sql stable security definer as
      $$ select coalesce((select role = any(required_roles) from tenant_members
                          where user_id = auth.uid() and tenant_id = get_user_tenant_id() limit 1), false) $$;
    grant execute on function get_user_tenant_id(), user_has_role(text[]) to authenticated;`)
}, 60_000) // booting PGlite under a full parallel run can exceed the 10 s default

describe('465_whatsapp_blocked_numbers', () => {
  it('replays cleanly', async () => {
    await db.exec(mig)
    await db.exec(mig)
  })

  it('a manager blocks a number for their own company, and it records who', async () => {
    const rows = await as<{ phone_number: string; blocked_by: string; blocked_message_count: number }>(BOSS,
      `insert into whatsapp_blocked_numbers(tenant_id, phone_number, reason)
       values ('${A}', '+201001234567', 'spam') returning phone_number, blocked_by, blocked_message_count`)
    expect(rows).toEqual([{ phone_number: '+201001234567', blocked_by: BOSS, blocked_message_count: 0 }])
  })

  it('staff see the list but cannot block or unblock', async () => {
    expect(await as(STAFF, 'select phone_number from whatsapp_blocked_numbers')).toHaveLength(1)
    await expect(as(STAFF, `insert into whatsapp_blocked_numbers(tenant_id, phone_number) values ('${A}', '+201009999999')`))
      .rejects.toThrow(/row-level security/)
    expect(await as(STAFF, `delete from whatsapp_blocked_numbers returning id`)).toEqual([])
  })

  it('another company neither sees nor touches it, nor blocks for it', async () => {
    expect(await as(OTHER_BOSS, 'select phone_number from whatsapp_blocked_numbers')).toEqual([])
    expect(await as(OTHER_BOSS, 'delete from whatsapp_blocked_numbers returning id')).toEqual([])
    await expect(as(OTHER_BOSS, `insert into whatsapp_blocked_numbers(tenant_id, phone_number) values ('${A}', '+201009999999')`))
      .rejects.toThrow(/row-level security/)
    // Its own block of the same number is its own.
    expect(await as(OTHER_BOSS, `insert into whatsapp_blocked_numbers(tenant_id, phone_number) values ('${B}', '+201001234567') returning tenant_id`))
      .toEqual([{ tenant_id: B }])
  })

  it('a number is E.164 and blocked once per company', async () => {
    await expect(db.exec(`insert into whatsapp_blocked_numbers(tenant_id, phone_number) values ('${A}', '01001234567')`))
      .rejects.toThrow(/check constraint/)
    await expect(db.exec(`insert into whatsapp_blocked_numbers(tenant_id, phone_number) values ('${A}', '+201001234567')`))
      .rejects.toThrow(/whatsapp_blocked_numbers_one_per_company/)
  })

  it('a manager unblocks', async () => {
    expect(await as(BOSS, `delete from whatsapp_blocked_numbers where phone_number = '+201001234567' returning tenant_id`))
      .toEqual([{ tenant_id: A }])
  })
})
