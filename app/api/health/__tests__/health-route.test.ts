import { describe, it, expect, vi, beforeEach } from 'vitest'

// /api/health contract: 200 + ok:true only when the DB round-trip succeeds;
// 503 + the failing check otherwise (query error, unreachable, or missing
// env). The module lazy-caches its client, so each case re-imports with a
// fresh module registry and its own mock.

const FAKE_URL = 'https://example.supabase.co'
const FAKE_KEY = 'service-role-key'

function mockSupabase(result: { error: { message: string } | null } | 'throws') {
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: () => ({
      from: () => ({
        select: () => ({
          limit: () =>
            result === 'throws'
              ? Promise.reject(new Error('ECONNREFUSED'))
              : Promise.resolve(result),
        }),
      }),
    }),
  }))
}

async function loadRoute() {
  return import('../route')
}

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('@supabase/supabase-js')
  process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY
})

describe('/api/health', () => {
  it('returns 200 with ok:true when the DB responds', async () => {
    mockSupabase({ error: null })
    const { GET } = await loadRoute()
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.checks.db.ok).toBe(true)
    expect(body.checks.db.latencyMs).toBeTypeOf('number')
  })

  it('returns 503 when the DB query errors', async () => {
    mockSupabase({ error: { message: 'permission denied' } })
    const { GET } = await loadRoute()
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.checks.db).toMatchObject({ ok: false, error: 'query failed' })
  })

  it('returns 503 when the DB is unreachable', async () => {
    mockSupabase('throws')
    const { GET } = await loadRoute()
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.checks.db).toMatchObject({ ok: false, error: 'unreachable' })
  })

  it('returns 503 unconfigured when env vars are missing (env-less build safety)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { GET } = await loadRoute()
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.checks.db).toMatchObject({ ok: false, error: 'unconfigured' })
  })

  it('never leaks raw error internals to the anonymous caller', async () => {
    mockSupabase({ error: { message: 'relation "user_profiles" does not exist at line 1' } })
    const { GET } = await loadRoute()
    const body = await (await GET()).json()
    expect(JSON.stringify(body)).not.toContain('user_profiles')
  })
})
