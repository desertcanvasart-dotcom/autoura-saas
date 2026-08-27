import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// ============================================
// FROM-SCRATCH MIGRATION REPLAY (self-hosted doctrine, plan §5)
// ============================================
// A self-hosted install is built by replaying supabase/migrations/*.sql in
// order against a fresh database (scripts/migrate.mjs). This test IS that
// install, run in-process against real Postgres (PGlite) with the Supabase
// environment stubbed. Every migration must apply cleanly from scratch —
// append-only and idempotent is the doctrine, and this is its enforcement:
// a new migration that only works against today's prod state fails HERE,
// not on a customer's first install.
//
// The exemption list is CLOSED: each entry depends on a real Supabase
// feature the stub cannot provide, verified by hand. Do not add to it to
// make a new migration pass — fix the migration.

const EXEMPT: Record<string, string> = {
  '004_quote_pdf_storage.sql': 'storage.buckets full column set (Supabase-managed schema)',
  '038_tenant_logos_storage.sql': 'storage.buckets full column set (Supabase-managed schema)',
  '205_copilot_knowledge_vector.sql': 'pgvector extension (available on Supabase, not in PGlite)',
  '261_support_chat.sql': 'supabase_realtime publication (Supabase-managed)',
  '273_revoke_gmail_token_columns.sql': 'self-check asserts live grant state; PGlite default privileges differ',
  '277_unified_messages_security_invoker.sql': 'self-check asserts live grant state; PGlite default privileges differ',
  '283_enable_rls_three_tables.sql': 'self-check counts RLS across tables the exempted files above would have configured',
}

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')

const SUPABASE_STUBS = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, raw_user_meta_data JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN DEFAULT false);
CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID);
CREATE SCHEMA extensions;
`

describe('migration replay from scratch', () => {
  it('every non-exempt migration applies cleanly to a fresh database', async () => {
    const db = new PGlite()
    await db.exec(SUPABASE_STUBS)

    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    expect(files.length).toBeGreaterThan(180)

    const unexpected: Array<{ file: string; message: string }> = []
    const exemptSeen: string[] = []

    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      try {
        await db.exec(sql)
      } catch (error) {
        const message = String((error as Error).message).split('\n')[0]
        if (EXEMPT[file]) exemptSeen.push(file)
        else unexpected.push({ file, message })
        await db.exec('ROLLBACK').catch(() => undefined)
      }
    }

    expect(
      unexpected,
      `Migrations that fail a from-scratch replay (a fresh self-hosted install would break here):\n` +
        unexpected.map(u => `  ${u.file}: ${u.message}`).join('\n')
    ).toEqual([])

    // The exemption list must not go stale: every entry still actually fails
    // under the stub (a fixed one should be REMOVED from the list).
    expect(exemptSeen.sort()).toEqual(Object.keys(EXEMPT).sort())
  }, 120_000)
})
