import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { planMailboxSweep } from '../email/scheduled-sync'

// ============================================================================
// Migration 415: a Gmail mailbox per person PER COMPANY.
// ============================================================================

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const U = '00000000-0000-0000-0000-00000000000a'
const A = '11111111-0000-0000-0000-000000000001'
const B = '22222222-0000-0000-0000-000000000002'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table tenants(id uuid primary key);
    insert into tenants values ('${A}'), ('${B}');
    create table tenant_members(tenant_id uuid, user_id uuid, status text, joined_at timestamptz);
    insert into tenant_members values ('${A}','${U}','active','2026-01-01'), ('${B}','${U}','active','2026-05-01');
    create table gmail_tokens(id serial primary key, user_id uuid, tenant_id uuid, email text, updated_at timestamptz);
    create unique index uq_gmail_tokens_user_id on gmail_tokens(user_id);
    insert into gmail_tokens(user_id, tenant_id, email) values ('${U}', null, 'me@a.com');
    create table email_sync_state(id serial primary key, user_id uuid not null unique, last_history_id text);
    insert into email_sync_state(user_id, last_history_id) values ('${U}', 'h1');
  `)
  await db.exec(read('supabase/migrations/415_gmail_mailbox_per_company.sql'))
  await db.exec(read('supabase/migrations/415_gmail_mailbox_per_company.sql')) // idempotent
})

describe('migration 415', () => {
  it('files an unfiled mailbox under the owner\'s oldest active company', async () => {
    expect((await db.query(`select tenant_id from gmail_tokens`)).rows).toEqual([{ tenant_id: A }])
  })

  it('lets the same person connect a mailbox in each company', async () => {
    await db.exec(`insert into gmail_tokens(user_id, tenant_id, email) values ('${U}', '${B}', 'me@b.com')`)
    expect((await db.query(`select count(*)::int n from gmail_tokens where user_id = '${U}'`)).rows).toEqual([{ n: 2 }])
  })

  it('still allows only one mailbox per person in a company (the upsert target)', async () => {
    await expect(db.exec(`insert into gmail_tokens(user_id, tenant_id, email) values ('${U}', '${A}', 'other@a.com')`)).rejects.toThrow()
    await db.exec(`insert into gmail_tokens(user_id, tenant_id, email) values ('${U}', '${A}', 'other@a.com')
      on conflict (user_id, tenant_id) do update set email = excluded.email`)
    expect((await db.query(`select email from gmail_tokens where tenant_id = '${A}'`)).rows).toEqual([{ email: 'other@a.com' }])
  })

  it('keeps sync progress per mailbox', async () => {
    expect((await db.query(`select tenant_id, last_history_id from email_sync_state`)).rows).toEqual([{ tenant_id: A, last_history_id: 'h1' }])
    await db.exec(`insert into email_sync_state(user_id, tenant_id, last_history_id) values ('${U}', '${B}', 'h9')`)
    expect((await db.query(`select count(*)::int n from email_sync_state`)).rows).toEqual([{ n: 2 }])
  })
})

describe('the scheduled sweep', () => {
  it('syncs the same person\'s mailbox in each company, each into its own', () => {
    const { mailboxes } = planMailboxSweep([
      { user_id: U, tenant_id: A, email: 'me@a.com', access_token: 'x', refresh_token: 'y' },
      { user_id: U, tenant_id: B, email: 'me@b.com', access_token: 'x', refresh_token: 'y' },
      { user_id: U, tenant_id: B, email: 'dup@b.com', access_token: 'x', refresh_token: 'y' },
    ])
    expect(mailboxes.map(m => [m.tenant_id, m.email])).toEqual([[A, 'me@a.com'], [B, 'me@b.com']])
  })
})

describe('the app reads the current company\'s mailbox', () => {
  it('every route that reads or refreshes a mailbox filters by company', () => {
    for (const f of [
      'app/api/gmail/emails/route.ts', 'app/api/gmail/actions/route.ts', 'app/api/gmail/labels/route.ts',
      'app/api/gmail/attachments/route.ts', 'app/api/gmail/send/route.ts', 'app/api/gmail/poll/route.ts',
      'app/api/send-supplier-document/route.ts', 'app/api/templates/send/route.ts', 'app/api/settings/email/route.ts',
      'app/api/email/sync/route.ts', 'app/settings/email/page.tsx', 'app/inbox/page.tsx', 'lib/email/own-address.ts',
    ]) {
      const src = read(f)
      const reads = src.split("from('gmail_tokens')").length - 1
      const scoped = (src.match(/from\('gmail_tokens'\)[\s\S]{0,400}?\.eq\('tenant_id'/g) ?? []).length
      expect(scoped, f).toBe(reads)
    }
  })

  it('Connect signs the company into the OAuth state, and the callback files the mailbox under it', () => {
    expect(read('app/api/gmail/connect/route.ts')).toContain('signState(`${userId}:${tenantId}`)')
    const cb = read('app/api/auth/google/callback/route.ts')
    expect(cb).toContain("onConflict: 'user_id,tenant_id'")
    expect(cb).toMatch(/stateTenant && \(memberships \?\? \[\]\)\.some/)
  })
})
