import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ rpc: null as null | ((args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) }))
vi.mock('@/lib/supabase-server', () => ({ createAdminClient: () => ({ rpc: (_fn: string, args: Record<string, unknown>) => h.rpc!(args) }) }))

import { checkSharedRateLimit } from '@/lib/rate-limit-shared'

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })

describe('rate_limit_take (migration 427) in Postgres', () => {
  it('counts per key within the window, then starts a new window', async () => {
    const db = new PGlite()
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
    await db.exec(readFileSync(join(process.cwd(), 'supabase/migrations/427_shared_rate_limits.sql'), 'utf8'))
    const take = async (key: string, limit = 2, secs = 3600) =>
      (await db.query(`SELECT * FROM rate_limit_take($1, $2, $3)`, [key, limit, secs])).rows[0] as { allowed: boolean; remaining: number }
    expect(await take('a')).toMatchObject({ allowed: true, remaining: 1 })
    expect(await take('a')).toMatchObject({ allowed: true, remaining: 0 })
    expect(await take('a')).toMatchObject({ allowed: false, remaining: 0 })
    expect(await take('b')).toMatchObject({ allowed: true }) // keys are separate
    // An elapsed window starts over.
    await db.exec(`UPDATE rate_limit_buckets SET window_start = NOW() - interval '2 hours' WHERE key = 'a'`)
    expect(await take('a')).toMatchObject({ allowed: true, remaining: 1 })
  })
})

describe('checkSharedRateLimit', () => {
  it('uses the database answer', async () => {
    h.rpc = async args => {
      expect(args).toEqual({ p_key: 'aiCompany:t1', p_limit: 300, p_window_seconds: 3600 })
      return { data: [{ allowed: false, remaining: 0, reset_at: '2026-10-16T15:00:00Z' }], error: null }
    }
    const r = await checkSharedRateLimit('t1', 'aiCompany')
    expect(r).toMatchObject({ success: false, remaining: 0, limit: 300 })
    expect(r.resetTime).toBe(Date.parse('2026-10-16T15:00:00Z'))
  })

  it('falls back to counting in memory when the database cannot answer', async () => {
    h.rpc = async () => ({ data: null, error: { message: 'function does not exist' } })
    const r = await checkSharedRateLimit(`t-${Math.random()}`, 'aiCompany')
    expect(r.success).toBe(true)
  })
})
