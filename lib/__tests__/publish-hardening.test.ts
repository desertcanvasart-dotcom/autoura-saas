import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { CONTRACT_VERSION } from '@/lib/publish/contract'

// ============================================================================
// Publish hardening (audit PB-1, PB-2, PB-6, PB-9, PB-11, PB-13):
//   · the renderer's door (secret + contract version) is one helper, and a
//     500 never carries the database's words;
//   · WhatsApp references are limited per visitor and per site — past it the
//     button still opens WhatsApp, only with no reference made;
//   · enquiries have a per-site ceiling as well as the per-visitor one;
//   · AI drafts and Google place searches have a per-company ceiling;
//   · a photo upload is refused before its body is read when the caller is
//     not allowed, or says it is too big.
// ============================================================================

const SITE = '11111111-1111-4111-8111-111111111111'

let limited = new Set<string>()
const limitCalls: Array<[string, string]> = []
vi.mock('@/lib/rate-limit-shared', () => ({
  checkSharedRateLimit: async (id: string, type: string) => {
    limitCalls.push([id, type])
    return { success: !limited.has(type), limit: 1, remaining: 0, resetTime: Date.now() }
  },
}))

const createWaRef = vi.fn(async (_db: unknown, _input: unknown, opts: { reference?: boolean } = {}) =>
  ({ number: '+201551772258', token: opts.reference === false ? null : 'ABCD2345', tourName: null }))
const recordWebEnquiry = vi.fn(async () => ({ enquiryId: '22222222-2222-4222-8222-222222222222' }))
vi.mock('@/lib/publish/enquiries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/publish/enquiries')>()),
  createWaRef: (...a: unknown[]) => createWaRef(...(a as [unknown, unknown, { reference?: boolean }])),
  recordWebEnquiry: (...a: unknown[]) => recordWebEnquiry(...(a as [])),
}))
vi.mock('@/lib/notifications', () => ({ notifyTeam: async () => {} }))

let auth: Record<string, unknown> = { error: 'Unauthorized', status: 401 }
const resolveSiteByEmbedKey = vi.fn()
vi.mock('@/lib/publish/embed', () => ({ resolveSiteByEmbedKey: (...a: unknown[]) => resolveSiteByEmbedKey(...a) }))
vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({}),
  requireAuth: async () => auth,
}))
const draftWithEngine = vi.fn(async () => ({ id: 'draft' }))
const findReviewPlaces = vi.fn(async () => ({ places: [] }))
vi.mock('@/lib/publish/admin', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/publish/admin')>()),
  draftWithEngine: (...a: unknown[]) => draftWithEngine(...(a as [])),
  findReviewPlaces: (...a: unknown[]) => findReviewPlaces(...(a as [])),
}))

const { publishInternalDenied } = await import('@/lib/publish/internal-route')
const { withActor, failureSaid } = await import('@/lib/publish/admin-route')
const { PublishError } = await import('@/lib/publish/admin')
const { POST: waRefPOST } = await import('@/app/api/publish/internal/wa-ref/route')
const { POST: enquiryPOST } = await import('@/app/api/publish/internal/enquiry/route')
const { GET: embedGET } = await import('@/app/api/publish/internal/embed/route')
const { POST: mediaPOST } = await import('@/app/api/publish/media/route')
const { POST: draftPOST } = await import('@/app/api/publish/pages/[id]/drafts/route')
const { POST: reviewsPOST } = await import('@/app/api/publish/reviews/route')

const internal = (path: string, body?: unknown, authz = 'Bearer internal-secret') => new NextRequest(`https://app.test${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { authorization: authz, 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

beforeEach(() => {
  process.env.PUBLISH_INTERNAL_SECRET = 'internal-secret'
  process.env.PUBLISH_INTERNAL_SECRET_PREVIOUS = 'old-secret'
  limited = new Set()
  limitCalls.length = 0
  createWaRef.mockClear()
  recordWebEnquiry.mockClear()
  auth = { error: 'Unauthorized', status: 401 }
})

describe("the renderer's door", () => {
  it('refuses without the secret, and a renderer on another contract version', async () => {
    expect(publishInternalDenied(internal('/x', undefined, 'Bearer guess'))!.status).toBe(401)
    expect(publishInternalDenied(internal('/x?v=1'))!.status).toBe(409)
    expect(publishInternalDenied(internal(`/x?v=${CONTRACT_VERSION}`))).toBeNull()
    expect(publishInternalDenied(internal('/x', undefined, 'Bearer old-secret'))).toBeNull()
  })

  it("a 500 says what failed, never the database's words", async () => {
    resolveSiteByEmbedKey.mockRejectedValueOnce(new Error('relation "publish_sites" does not exist'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await embedGET(internal('/api/publish/internal/embed?key=k'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'embed lookup failed' })
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('the WhatsApp button (references are rows: limited)', () => {
  const click = { siteId: SITE, pageId: null, language: 'en', landingUrl: null, visitorIp: '203.0.113.9' }

  it('within the limits: a reference, counted per visitor and per site', async () => {
    const res = await waRefPOST(internal('/api/publish/internal/wa-ref', click))
    expect((await res.json()).token).toBe('ABCD2345')
    expect(limitCalls).toEqual([['publish-wa:203.0.113.9', 'publishWaVisitor'], [`publish-wa-site:${SITE}`, 'publishWaSite']])
  })

  it('a visitor past their limit still gets the number, but no reference is made', async () => {
    limited.add('publishWaVisitor')
    const res = await waRefPOST(internal('/api/publish/internal/wa-ref', click))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ number: '+201551772258', token: null })
    expect(createWaRef.mock.calls[0][2]).toEqual({ reference: false })
  })

  it('a site past its limit: the same', async () => {
    limited.add('publishWaSite')
    await waRefPOST(internal('/api/publish/internal/wa-ref', click))
    expect(createWaRef.mock.calls[0][2]).toEqual({ reference: false })
  })

  it('a renderer that sends no address yet is still understood (site limit only)', async () => {
    const older = { ...click, visitorIp: undefined } // dropped by JSON
    const res = await waRefPOST(internal('/api/publish/internal/wa-ref', older))
    expect(res.status).toBe(200)
    expect(limitCalls).toEqual([[`publish-wa-site:${SITE}`, 'publishWaSite']])
  })
})

describe('enquiries: a per-site ceiling as well as the per-visitor one', () => {
  const enquiry = { siteId: SITE, pageId: null, language: 'en', name: 'Lena', email: 'lena@example.com', phone: null, travellers: 2, travelDate: null, message: null, landingUrl: null, visitorIp: '203.0.113.9' }

  it('counts both, and is refused (429) past the site ceiling without saving', async () => {
    expect((await enquiryPOST(internal('/api/publish/internal/enquiry', enquiry))).status).toBe(201)
    expect(limitCalls).toEqual([['publish-enquiry:203.0.113.9', 'contact'], [`publish-enquiry-site:${SITE}`, 'publishEnquirySite']])
    limited.add('publishEnquirySite')
    recordWebEnquiry.mockClear()
    expect((await enquiryPOST(internal('/api/publish/internal/enquiry', enquiry))).status).toBe(429)
    expect(recordWebEnquiry).not.toHaveBeenCalled()
  })
})

describe('Publish admin answers', () => {
  const signedIn = { error: null, status: 200, user: { id: 'u1', email: 'a@b.co', user_metadata: {} }, tenant_id: 'tenant-a', role: 'manager' }

  it('a broken rule, or what Google or the host said, is said as written; our own 500 is not', async () => {
    auth = signedIn
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const said = async (e: unknown) => {
      const res = await withActor('read', async () => { throw e })
      return [res.status, (await res.json()).error]
    }
    expect(await said(new PublishError('Say which language.', 400))).toEqual([400, 'Say which language.'])
    expect(await said(new PublishError('Google could not search just now.', 502))).toEqual([502, 'Google could not search just now.'])
    expect(await said(new PublishError('Could not save the draft: duplicate key value violates "x"', 500))).toEqual([500, 'Could not save the draft.'])
    expect(await said(new PublishError('reading the site: permission denied for table publish_sites', 500))).toEqual([500, 'Something went wrong reading the site.'])
    expect(await said(new Error('connection refused at 10.0.0.4'))).toEqual([500, 'Something went wrong'])
    err.mockRestore()
  })

  it('failureSaid keeps only what could not be done', () => {
    expect(failureSaid('Could not change it: boom')).toBe('Could not change it.')
    expect(failureSaid('')).toBe('Something went wrong')
  })

  it('AI drafts and Google searches have a per-company ceiling', async () => {
    auth = signedIn
    const draft = () => draftPOST(new Request('https://app.test/x', { method: 'POST', body: JSON.stringify({ kind: 'overview', language: 'en' }) }), { params: Promise.resolve({ id: 'p1' }) })
    expect((await draft()).status).toBe(200)
    expect(limitCalls).toContainEqual(['publish-draft:tenant-a', 'publishDraftCompany'])
    limited.add('publishDraftCompany')
    draftWithEngine.mockClear()
    expect((await draft()).status).toBe(429)
    expect(draftWithEngine).not.toHaveBeenCalled()

    const search = () => reviewsPOST(new Request('https://app.test/x', { method: 'POST', body: JSON.stringify({ query: 'Sunrise Travel' }) }))
    expect((await search()).status).toBe(200)
    expect(limitCalls).toContainEqual(['publish-place-search:tenant-a', 'publishPlaceSearchCompany'])
    limited.add('publishPlaceSearchCompany')
    findReviewPlaces.mockClear()
    expect((await search()).status).toBe(429)
    expect(findReviewPlaces).not.toHaveBeenCalled()
  })

  it('a photo upload is not read before the caller is allowed, nor when it says it is too big', async () => {
    const upload = (headers: Record<string, string> = {}) => {
      const req = new Request('https://app.test/api/publish/media', { method: 'POST', headers })
      const formData = vi.spyOn(req, 'formData')
      return { req, formData }
    }
    const anon = upload()
    expect((await mediaPOST(anon.req)).status).toBe(401)
    expect(anon.formData).not.toHaveBeenCalled()

    auth = { ...signedIn, role: 'member' }
    const member = upload()
    expect((await mediaPOST(member.req)).status).toBe(403)
    expect(member.formData).not.toHaveBeenCalled()

    auth = signedIn
    const big = upload({ 'content-length': String(50 * 1024 * 1024) })
    const res = await mediaPOST(big.req)
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('Photos must be under 10 MB.')
    expect(big.formData).not.toHaveBeenCalled()

    const empty = upload()
    expect((await mediaPOST(empty.req)).status).toBe(400)
  })
})
