import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Stage 0 of the owner dashboard (2026-09-25).
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ---- migration 390 on a real (in-memory) Postgres ----
const OWNER = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'
const T2E = '11111111-0000-0000-0000-000000000001'
const SAWA = '22222222-0000-0000-0000-000000000002'
const SILLAGE = '33333333-0000-0000-0000-000000000003'
let db: PGlite

async function as(user: string, sql: string) {
  await db.exec(`select set_config('test.uid', '${user}', false)`)
  return (await db.query(sql)).rows
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table tenant_members(id serial primary key, tenant_id uuid, user_id uuid, role text, status text, joined_at timestamptz);
    create table gmail_tokens(id serial primary key, user_id uuid, tenant_id uuid);
    -- the policy 002 already has, so 390's addition is tested alongside it
    create function get_user_tenant_id() returns uuid language sql as $$ select null::uuid $$;
    alter table tenant_members enable row level security;
    create policy "Users can view tenant members" on tenant_members for select using (tenant_id = get_user_tenant_id());
    -- the owner: oldest membership INACTIVE, then Sawa (older) and T2E
    insert into tenant_members(tenant_id,user_id,role,status,joined_at) values
      ('${SILLAGE}','${OWNER}','owner','inactive','2026-07-01'),
      ('${T2E}','${OWNER}','owner','active','2026-09-24'),
      ('${SAWA}','${OWNER}','manager','active','2026-09-18'),
      ('${T2E}','${OTHER}','manager','active','2026-08-01');
    insert into gmail_tokens(user_id, tenant_id) values ('${OWNER}', null), ('${OTHER}', '${SILLAGE}');
    create role app_user; grant select on tenant_members to app_user; grant usage on schema auth to app_user;
  `)
  await db.exec(read('supabase/migrations/390_one_company_rule_and_mailbox_companies.sql'))
})

describe('migration 390', () => {
  it("get_user_tenant_id() is the app's rule: oldest ACTIVE membership, then the lower id", async () => {
    expect((await as(OWNER, 'select get_user_tenant_id() t'))[0]).toEqual({ t: SAWA })
    expect((await as(OTHER, 'select get_user_tenant_id() t'))[0]).toEqual({ t: T2E })
  })

  it('a person sees ALL their own memberships — and no one else’s from another company', async () => {
    await db.exec(`set role app_user`)
    const mine = await as(OWNER, `select tenant_id from tenant_members where user_id = '${OWNER}' order by joined_at`)
    const others = await as(OWNER, `select user_id from tenant_members where user_id <> '${OWNER}'`)
    await db.exec(`reset role`)
    expect(mine.map(r => (r as { tenant_id: string }).tenant_id)).toEqual([SILLAGE, SAWA, T2E])
    expect(others).toEqual([]) // OTHER is in T2E, not the owner's current company (Sawa)
  })

  it('files an unfiled mailbox by the same rule, and never changes a filed one', async () => {
    const rows = (await db.query<{ user_id: string; tenant_id: string }>(`select user_id, tenant_id from gmail_tokens order by id`)).rows
    expect(rows).toEqual([{ user_id: OWNER, tenant_id: SAWA }, { user_id: OTHER, tenant_id: SILLAGE }])
  })
})

// ---- the sync's wiring ----
describe('the scheduled sync', () => {
  const sync = read('app/api/email/sync/route.ts')
  const cron = read('app/api/cron/gmail-sync/route.ts')

  it('runs in history mode and records what it did', () => {
    expect(cron).toContain('use_history: true')
    expect(cron).toMatch(/summary,/)
  })

  it('advances the history id only after a clean, complete run', () => {
    expect(sync).toContain("const clean = downloaded.failed === 0 && insertFailed === 0")
    expect(sync).toContain('const advance = clean && !candidates.truncated && Boolean(candidates.historyId)')
    expect(sync).toContain('...(advance ? { last_history_id: candidates.historyId } : {})')
  })

  it('a partial run is reported, not passed off as success', () => {
    expect(sync).toMatch(/sync_status: clean \? 'idle' : 'partial'/)
    expect(cron).toContain('res.ok && body.success && !body.warning')
  })

  it('no message download is swallowed any more', () => {
    const code = sync.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
    expect(code).not.toMatch(/messages\.get\([^)]*\)[\s\S]{0,200}\}\s*catch\s*\{\s*\}/)
    expect(code).toContain('downloadMessages(gmail, toFetch)')
  })

  it('mailbox → company uses ACTIVE memberships everywhere it is decided', () => {
    for (const f of ['app/api/email/sync/route.ts', 'app/api/cron/gmail-sync/route.ts', 'app/api/auth/google/callback/route.ts']) {
      expect(read(f), f).toMatch(/tenant_members'\)[\s\S]{0,200}\.eq\('status', 'active'\)/)
    }
  })
})
