import { describe, it, expect, vi, beforeEach } from 'vitest'

// SHA resolution order for /api/version: explicit GIT_SHA beats Railway's
// injected RAILWAY_GIT_COMMIT_SHA beats git-checkout fallback. The module
// caches at import, so each case re-imports with a fresh module registry.

const RAILWAY_SHA = 'b'.repeat(40)
const EXPLICIT_SHA = 'a'.repeat(40)

async function loadRoute() {
  vi.resetModules()
  return import('../route')
}

beforeEach(() => {
  delete process.env.GIT_SHA
  delete process.env.RAILWAY_GIT_COMMIT_SHA
})

describe('/api/version sha resolution', () => {
  it('prefers explicit GIT_SHA over Railway', async () => {
    process.env.GIT_SHA = EXPLICIT_SHA
    process.env.RAILWAY_GIT_COMMIT_SHA = RAILWAY_SHA
    const { GET } = await loadRoute()
    const body = await (await GET()).json()
    expect(body).toMatchObject({ sha: EXPLICIT_SHA, shaSource: 'env' })
  })

  it('uses RAILWAY_GIT_COMMIT_SHA when GIT_SHA is absent', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = RAILWAY_SHA
    const { GET } = await loadRoute()
    const body = await (await GET()).json()
    expect(body).toMatchObject({ sha: RAILWAY_SHA, shaSource: 'railway' })
  })

  it('falls back to the git checkout when no env vars are set', async () => {
    const { GET } = await loadRoute()
    const body = await (await GET()).json()
    // Running inside the repo, so the git branch resolves a real 40-char sha.
    expect(body.shaSource).toBe('git')
    expect(body.sha).toMatch(/^[0-9a-f]{40}$/)
  })
})
