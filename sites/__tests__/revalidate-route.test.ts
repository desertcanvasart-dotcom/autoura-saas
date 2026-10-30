import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSignatureHeader, SIGNATURE_HEADER } from '@/lib/concierge-webhook-auth'
import { createRevalidator } from '@/lib/publish/sync/revalidate'

// ============================================================================
// The renderer's /api/revalidate, wired to the real sync client: what the
// worker sends is what expires here — at once (expire: 0), not "stale while
// it rebuilds", so the next visitor sees the new price.
// ============================================================================

const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }))

const { POST } = await import('../app/api/revalidate/route')
const TENANT = '00000000-0000-4000-8000-0000000000aa'

beforeEach(() => {
  process.env.PUBLISH_REVALIDATE_SECRET = 'rv-secret'
  delete process.env.PUBLISH_REVALIDATE_SECRET_PREVIOUS
})

describe('/api/revalidate on the renderer', () => {
  it('the worker\'s signed request expires each tag immediately and is confirmed in full', async () => {
    const fetchImpl = (async (url: string, init: RequestInit) =>
      POST(new Request(url, init))) as unknown as typeof fetch
    const revalidate = createRevalidator({ rendererUrl: 'https://sites.test', secret: 'rv-secret', fetchImpl })
    await revalidate(TENANT, [`publish:tenant:${TENANT}:tours`, `publish:tenant:${TENANT}`])
    expect(revalidateTag.mock.calls).toEqual([
      [`publish:tenant:${TENANT}:tours`, { expire: 0 }],
      [`publish:tenant:${TENANT}`, { expire: 0 }],
    ])
  })
  it('an unsigned or wrongly signed request expires nothing', async () => {
    const body = JSON.stringify({ tenantId: TENANT, tags: ['x'], sentAt: new Date().toISOString() })
    const bad = await POST(new Request('https://sites.test/api/revalidate', { method: 'POST', body }))
    expect(bad.status).toBe(401)
    const t = Math.floor(Date.now() / 1000)
    const forged = await POST(new Request('https://sites.test/api/revalidate', {
      method: 'POST', body, headers: { [SIGNATURE_HEADER]: buildSignatureHeader('wrong-secret', t, body) },
    }))
    expect(forged.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
