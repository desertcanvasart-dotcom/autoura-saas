import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 401 on a real Postgres: the blog table is server-only (anon and
// authenticated can do nothing; verify-rls finds nothing to read), its slug is
// a URL, a published post has a date, and the file replays.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/401_blog_posts.sql'), 'utf8')
const rejects = async (sql: string) => {
  try { await db.exec(sql) } catch { return true }
  return false
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;`)
  await db.exec(mig)
}, 60_000)

describe('401_blog_posts', () => {
  it('replays cleanly', async () => {
    await db.exec(mig)
  })

  it('only the service role has a policy; anon and authenticated have no grants', async () => {
    const { rows } = await db.query<Record<string, boolean>>(`select
      has_table_privilege('anon', 'public.blog_posts', 'SELECT') as anon_read,
      has_table_privilege('authenticated', 'public.blog_posts', 'SELECT') as auth_read,
      has_table_privilege('authenticated', 'public.blog_posts', 'INSERT') as auth_write`)
    expect(rows[0]).toEqual({ anon_read: false, auth_read: false, auth_write: false })
    const policies = await db.query(`select policyname, roles::text as roles from pg_policies where tablename = 'blog_posts'`)
    expect(policies.rows).toEqual([{ policyname: 'blog_posts_service_role', roles: '{service_role}' }])
  })

  it('a published post needs a date; the slug is a unique URL; en or ja', async () => {
    await db.exec(`insert into blog_posts (slug, title) values ('a-draft', 'A draft')`)
    expect(await rejects(`insert into blog_posts (slug, title, status) values ('undated', 'X', 'published')`)).toBe(true)
    for (const bad of ['Upper', 'a--b', '-a', 'a-', 'a b']) {
      expect(await rejects(`insert into blog_posts (slug, title) values ('${bad}', 'X')`)).toBe(true)
    }
    expect(await rejects(`insert into blog_posts (slug, title) values ('a-draft', 'Same')`)).toBe(true)
    expect(await rejects(`insert into blog_posts (slug, title, language) values ('fr', 'X', 'fr')`)).toBe(true)
  })
})
