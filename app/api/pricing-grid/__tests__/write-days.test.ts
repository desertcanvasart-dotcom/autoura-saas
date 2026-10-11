import { describe, it, expect, vi, beforeEach } from 'vitest'

let role = 'member'
const aiCalls: Array<Record<string, unknown>> = []
let aiReply: unknown = null
const increments: string[] = []

const libraryRows = [{
  id: 'k', name: 'Karnak Temple Complex', location: 'Luxor', short_description: null, metadata: null,
  content_categories: { slug: 'sites-attractions' },
  content_variations: [{ tier: 'standard', title: 'Karnak', description: 'The great temple of Amun.', highlights: null, day_by_day: null, is_active: true }],
}]
const ruleRows = [{ name: 'Second person', description: 'Address the traveller as "you".', rule_type: 'enforce', priority: 5, applies_to: ['itinerary'], applies_to_tiers: null, examples: null }]

function query(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  Object.assign(q, { select: () => q, eq: () => q, then: (res: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res) })
  return q
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', role, user: { id: 'u1' }, supabase: {} }),
  createAdminClient: () => ({ from: (t: string) => query(t === 'content_library' ? libraryRows : ruleRows) }),
}))
vi.mock('@/lib/usage-enforcement', () => ({
  gateVolume: async () => ({ ok: true, usage: null }),
  incrementVolumeUsage: (_t: string, metric: string) => { increments.push(metric) },
  loadUsageAnchor: async () => null,
}))
vi.mock('@/lib/ai/anthropic-client', () => ({
  createMessageWithRetry: async (params: Record<string, unknown>) => {
    aiCalls.push(params)
    return { stop_reason: 'end_turn', content: [] }
  },
  replyText: () => JSON.stringify(aiReply),
  isAiServiceError: () => false,
  getUserFriendlyError: () => ({ message: 'x', status: 500 }),
}))

const day = (dayNumber: number, description = '', title = `Day ${dayNumber}`) => ({
  id: `d${dayNumber}`, dayNumber, title, city: 'Luxor', description, isExpanded: false,
  slots: [{ slotId: 'entrance_fees', selectedItems: [{ rateId: 'e1', name: 'Karnak Temple', rateEur: 1, rateNonEur: 1 }], customAmount: 0 }],
})

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/pricing-grid/write-days/route')
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)
  return { status: res.status, ...(await res.json()) }
}

beforeEach(() => {
  role = 'member'
  aiCalls.length = 0
  increments.length = 0
  aiReply = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Write descriptions', () => {
  it('fills only the days with no description, from the matched library text and the house style', async () => {
    aiReply = { days: [{ day: 1, title: 'Karnak at dawn', description: 'You walk through Karnak.' }] }
    const r = await post({ days: [day(1), day(2, 'Our own words.', 'West Bank')], tier: 'standard', mode: 'fill' })
    expect(r.success).toBe(true)
    expect(r.data.written).toEqual([{
      dayNumber: 1, title: 'Karnak at dawn', description: 'You walk through Karnak.',
      sources: [{ name: 'Karnak Temple Complex', kind: 'site', tier: 'standard', otherTier: false }],
    }])
    const content = (aiCalls[0].messages as Array<{ content: Array<{ text: string }> }>)[0].content
    expect(content[0].text).toContain('MUST follow:\n- Second person')
    expect(content[1].text).toContain('The great temple of Amun.')
    expect(content[1].text).not.toContain('Our own words.')
    expect(increments).toEqual(['ai_generations'])
  })

  it('a fill keeps a title the operator chose; a rewrite replaces it', async () => {
    aiReply = { days: [{ day: 1, title: 'New title', description: 'New text.' }] }
    const fill = await post({ days: [day(1, '', 'Temples of the East Bank')], mode: 'fill' })
    expect(fill.data.written[0].title).toBe('Temples of the East Bank')
    const rewrite = await post({ days: [day(1, 'Old text.', 'Temples of the East Bank')], mode: 'rewrite', dayNumbers: [1] })
    expect(rewrite.data.written[0]).toMatchObject({ title: 'New title', description: 'New text.' })
  })

  it('nothing to write: no AI call, nothing counted', async () => {
    const r = await post({ days: [day(1, 'Written.')], mode: 'fill' })
    expect(r.data.written).toEqual([])
    expect(aiCalls).toHaveLength(0)
    expect(increments).toHaveLength(0)
  })

  it('an unusable reply is an error and is not counted', async () => {
    aiReply = { days: [] }
    const r = await post({ days: [day(1)], mode: 'fill' })
    expect(r.status).toBe(502)
    expect(increments).toHaveLength(0)
  })

  it('viewers cannot use it; a rewrite must name its day', async () => {
    role = 'viewer'
    expect((await post({ days: [day(1)], mode: 'fill' })).status).toBe(403)
    role = 'member'
    expect((await post({ days: [day(1)], mode: 'rewrite' })).status).toBe(400)
  })
})

describe('Write descriptions reads only this company’s library', () => {
  it('the content and the rules are both read for the signed-in company', async () => {
    const { readFileSync } = await import('node:fs')
    const route = readFileSync('app/api/pricing-grid/write-days/route.ts', 'utf8')
    const load = route.slice(route.indexOf('async function loadLibrary'), route.indexOf('export async function POST'))
    expect(load.match(/\.eq\('tenant_id', tenantId\)/g)).toHaveLength(2)
    expect(route).toContain("roleDenied(auth.role, 'staff')")
    expect(route).toContain("gateVolume(supabase, tenant_id, 'ai_generations'")
  })
})

describe('the old generator is gone', () => {
  it('no route or helper of it remains', async () => {
    const { existsSync } = await import('node:fs')
    for (const f of ['app/api/ai/generate-itinerary/route.ts', 'lib/ai/prompt-builder.ts', 'lib/ai/content-library.ts', 'lib/ai/service-creation.ts']) {
      expect(existsSync(f), f).toBe(false)
    }
  })
})
