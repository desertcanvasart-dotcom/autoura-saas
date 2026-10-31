import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 457 on a real Postgres: a staff (member) login reads only the
// tasks and follow-ups that are theirs or no one's; a manager reads them all.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/457_staff_see_own_tasks.sql'), 'utf8')

const T = '00000000-0000-0000-0000-00000000000a'
const STAFF = '00000000-0000-0000-0000-0000000000b1'
const OTHER = '00000000-0000-0000-0000-0000000000b2'
const BOSS = '00000000-0000-0000-0000-0000000000b3'

async function as(user: string, sql: string) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
  try {
    return (await db.query<{ title: string }>(sql)).rows.map(r => r.title).sort()
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

    create table tenant_members(user_id uuid, tenant_id uuid, role text, status text);
    create table team_members(id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid);
    create table tasks(id uuid primary key default gen_random_uuid(), tenant_id uuid not null, title text, assigned_to uuid);
    create table client_followups(
      id uuid primary key default gen_random_uuid(), tenant_id uuid not null, description text,
      assigned_to uuid, created_by uuid);

    insert into tenant_members values
      ('${STAFF}', '${T}', 'member', 'active'), ('${OTHER}', '${T}', 'member', 'active'), ('${BOSS}', '${T}', 'manager', 'active');
    insert into team_members(id, tenant_id, user_id) values
      ('00000000-0000-0000-0000-0000000000c1', '${T}', '${STAFF}'),
      ('00000000-0000-0000-0000-0000000000c2', '${T}', '${OTHER}'),
      ('00000000-0000-0000-0000-0000000000c3', '${T}', null);
    insert into tasks(tenant_id, title, assigned_to) values
      ('${T}', 'mine', '00000000-0000-0000-0000-0000000000c1'),
      ('${T}', 'theirs', '00000000-0000-0000-0000-0000000000c2'),
      ('${T}', 'driver', '00000000-0000-0000-0000-0000000000c3'),
      ('${T}', 'nobody', null);
    insert into client_followups(tenant_id, description, assigned_to, created_by) values
      ('${T}', 'assigned to me', '${STAFF}', null),
      ('${T}', 'I made it for them', '${OTHER}', '${STAFF}'),
      ('${T}', 'theirs', '${OTHER}', '${OTHER}'),
      ('${T}', 'nobody', null, null);

    -- The company-only permissive rules the real tables already have.
    alter table tasks enable row level security;
    alter table client_followups enable row level security;
    create policy all_rows on tasks for all to authenticated using (true) with check (true);
    create policy all_rows on client_followups for all to authenticated using (true) with check (true);
    grant select, insert, update, delete on tasks, client_followups to authenticated;
    grant select on tenant_members, team_members to authenticated;`)
}, 60_000) // booting PGlite under a full parallel run can exceed the 10 s default

describe('457_staff_see_own_tasks', () => {
  it('replays cleanly', async () => {
    await db.exec(mig)
    await db.exec(mig)
  })

  it('staff read their own and unassigned tasks only', async () => {
    expect(await as(STAFF, 'select title from tasks')).toEqual(['mine', 'nobody'])
  })

  it('a login outside the company is not limited by this rule (its company rules apply)', async () => {
    expect(await as('00000000-0000-0000-0000-0000000000b9', 'select title from tasks'))
      .toEqual(['driver', 'mine', 'nobody', 'theirs'])
  })

  it('managers read every task', async () => {
    expect(await as(BOSS, 'select title from tasks')).toEqual(['driver', 'mine', 'nobody', 'theirs'])
  })

  it('staff read follow-ups assigned to them, made by them, or unassigned', async () => {
    expect(await as(STAFF, 'select description as title from client_followups'))
      .toEqual(['I made it for them', 'assigned to me', 'nobody'])
    expect(await as(BOSS, 'select description as title from client_followups')).toHaveLength(4)
  })

  it("staff work their own tasks, not someone else's, and don't reassign them", async () => {
    expect(await as(STAFF, `update tasks set title = 'hacked' where title = 'theirs' returning title`)).toEqual([])
    expect(await as(STAFF, `update tasks set title = 'mine' where title = 'mine' returning title`)).toEqual(['mine'])
    await expect(as(STAFF, `update tasks set assigned_to = '00000000-0000-0000-0000-0000000000c2' where title = 'mine'`))
      .rejects.toThrow(/row-level security/)
    expect(await as(BOSS, `update tasks set assigned_to = '00000000-0000-0000-0000-0000000000c1' where title = 'theirs' returning title`))
      .toEqual(['theirs'])
  })

  it('a new follow-up records who made it', async () => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${STAFF}', false);
      insert into client_followups(tenant_id, description) values ('${T}', 'new'); reset role;`)
    const r = await db.query<{ created_by: string }>(`select created_by from client_followups where description = 'new'`)
    expect(r.rows[0].created_by).toBe(STAFF)
  })
})
