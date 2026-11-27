import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// End to end: an enquiry → a company-prompt draft quoting the real rate
// ============================================
// generateDraftReplies run against an in-memory company (the Travel to Egypt
// prompt from docs/copilot, one tour with an approved public rate) with the
// model, the engine, retrieval and the AI ceiling stubbed. The stub model
// writes its reply FROM the system prompt it is sent, so the test proves the
// company prompt and the RATES block reached it — not that a real model
// writes well. COPILOT_LIVE=1 sends the same prompt to the real model.

const LIVE = process.env.COPILOT_LIVE === '1'

const ai = vi.hoisted(() => ({ calls: [] as Array<{ system: string; user: string }> }))
const limits = vi.hoisted(() => ({ calls: [] as Array<[string, string]> }))

vi.mock('@/lib/ai/anthropic-client', async (orig) => {
  const real = await orig<typeof import('@/lib/ai/anthropic-client')>()
  if (process.env.COPILOT_LIVE === '1') return real
  return {
    ...real,
    createMessageWithRetry: vi.fn(async (params: { system: string; messages: Array<{ content: string }> }) => {
      const system = String(params.system)
      ai.calls.push({ system, user: String(params.messages[0].content) })
      let text: string
      if (system.startsWith('You match a travel enquiry')) {
        text = '{"templateIds":["tpl-giza"],"travelDate":null,"pax":null}'
      } else if (/supplier/i.test(String(params.messages[0].content)) && /invoice/i.test(String(params.messages[0].content))) {
        text = 'NO_DRAFT: supplier invoice, not a travel enquiry'
      } else {
        // Compose only from what the prompt supplies.
        const four = /4 pax (\d+)/.exec(system)?.[1] ?? '[price to be confirmed by our team]'
        const child = /Children under 12 pay (\d+%)/.exec(system)?.[1] ?? '?'
        const dated = /Date-specific \(([^)]+)\): (\d+)/.exec(system)
        text = [
          'Dear Sarah,',
          '',
          'Thank you for your enquiry about a private Giza Pyramids and Saqqara day tour for your family of four on 13 March.',
          '',
          `For 4 travellers the tour is EUR ${four} per person${dated ? ` (EUR ${dated[2]} per person on ${dated[1].split(',')[0]})` : ''}. Your 8-year-old pays ${child} of the adult rate; your 14-year-old pays the adult rate.`,
          '',
          'Warm regards,',
          'Islam Hussein',
          'Travel to Egypt',
        ].join('\n')
      }
      return { content: [{ type: 'text', text }] }
    }),
  }
})
vi.mock('@/lib/rate-limit-shared', () => ({
  checkSharedRateLimit: vi.fn(async (id: string, type: string) => { limits.calls.push([id, type]); return { success: true } }),
}))
vi.mock('@/lib/copilot-retrieval', () => ({
  retrieveKnowledge: vi.fn(async () => []),
  formatRetrievalContext: () => '',
}))
vi.mock('@/lib/auto-pricing-service', () => ({
  // The engine for 13 Mar 2027, 4 pax: EU 76, other 78 — the higher (78) is quoted.
  calculateAutoPricing: vi.fn(async (p: { isEurPassport: boolean }) => ({
    success: true, complete: true, currency: 'EUR', pricePerPerson: p.isEurPassport ? 76 : 78,
  })),
}))

import { generateDraftReplies } from '@/lib/copilot-suggest'

// ---------- an in-memory Supabase ----------

type Row = Record<string, unknown>
function memoryDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map(r => ({ ...r }))]))
  let n = 0
  function from(table: string) {
    tables[table] ??= []
    let filters: Array<(r: Row) => boolean> = []
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Row[] = []
    let patch: Row = {}
    let limitN: number | null = null
    let orderBy: { col: string; asc: boolean } | null = null
    const rows = () => {
      let r = tables[table].filter(row => filters.every(f => f(row)))
      if (orderBy) {
        const { col, asc } = orderBy
        r = [...r].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : 1) * (asc ? 1 : -1))
      }
      return limitN === null ? r : r.slice(0, limitN)
    }
    const run = (): Row[] => {
      if (op === 'insert') {
        const added = payload.map(p => ({ id: `${table}-${++n}`, created_at: new Date(Date.now() + n).toISOString(), ...p }))
        tables[table].push(...added)
        return added
      }
      if (op === 'update') {
        const hit = rows()
        for (const r of hit) Object.assign(r, patch)
        return hit
      }
      return rows()
    }
    const q = {
      select: () => q,
      insert: (v: Row | Row[]) => { op = 'insert'; payload = Array.isArray(v) ? v : [v]; return q },
      update: (v: Row) => { op = 'update'; patch = v; return q },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
      neq: (c: string, v: unknown) => { filters.push(r => r[c] !== v); return q },
      in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
      not: (c: string) => { filters.push(r => r[c] !== null && r[c] !== undefined); return q },
      order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending !== false }; return q },
      limit: (k: number) => { limitN = k; return q },
      single: async () => { const r = run(); return r[0] ? { data: r[0], error: null } : { data: null, error: { message: 'no rows' } } },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(res, rej),
    }
    filters = []
    return q
  }
  return { from, tables }
}

const T = 'tenant-t2e'
const T2E_PROMPT = readFileSync(path.join(process.cwd(), 'docs/copilot/copilot-system-prompt-travel2egypt.md'), 'utf8')

function seed(body: string, subject = 'Pyramids for our family') {
  return memoryDb({
    tenants: [{ id: T, company_name: 'Travel to Egypt', default_margin_percent: 25 }],
    tenant_features: [{ tenant_id: T, copilot_pregenerate_enabled: true, copilot_system_prompt: T2E_PROMPT }],
    unified_conversations: [{ id: 'conv-1', tenant_id: T, client_id: null, contact_name: 'Sarah Miller', contact_email: 'sarah@example.com' }],
    email_messages: [{
      unified_conversation_id: 'conv-1', gmail_message_id: 'gm-1', gmail_thread_id: 'th-1', direction: 'inbound',
      from_email: 'sarah@example.com', subject, body_text: body, snippet: body.slice(0, 80), sent_at: '2026-11-26T09:00:00Z',
    }],
    tour_templates: [
      { id: 'tpl-giza', tenant_id: T, template_name: 'Giza Pyramids & Saqqara Private Day Tour', template_code: 'T2E-DT-01', is_active: true },
      { id: 'tpl-luxor', tenant_id: T, template_name: 'Ultimate Luxor Day Tour', template_code: 'T2E-DT-07', is_active: true },
    ],
    publish_pages: [{
      tenant_id: T, tour_template_id: 'tpl-giza', public_rate_approved_at: '2026-11-20T10:00:00Z',
      public_rate: { tier: 'standard', currency: 'EUR', bands: [
        { minPax: 1, maxPax: 2, perPerson: 95 }, { minPax: 3, maxPax: 3, perPerson: 82 }, { minPax: 4, maxPax: 4, perPerson: 74 },
        { minPax: 5, maxPax: 6, perPerson: 66 }, { minPax: 7, maxPax: 8, perPerson: 61 },
      ] },
    }],
    communication_threads: [], communication_inbox: [], communication_drafts: [], copilot_settings: [],
  })
}

const ENQUIRY = 'Hello, we are a family of 4, kids 8 and 14. We would like to see the pyramids on 13 March. What would it cost? Thanks, Sarah'

describe('copilot lead reply — company prompt + live rates', () => {
  beforeEach(() => { ai.calls.length = 0; limits.calls.length = 0 })

  it('writes ONE draft that quotes the 4-pax public price and the 50% child rate', async () => {
    const db = seed(ENQUIRY)
    const result = await generateDraftReplies({
      supabase: db as never, tenantId: T, channel: 'email', unifiedConversationId: 'conv-1',
      reviewerUserId: null, count: 2, skipIfPendingExists: true,
    })
    expect(result.success).toBe(true)
    expect(result.drafts).toHaveLength(1)
    const draft = db.tables.communication_drafts[0] as { draft_body: string; context_used: Record<string, unknown>; status: string }
    expect(draft.status).toBe('pending')
    expect(draft.draft_body).toContain('74')
    expect(draft.draft_body).toContain('50%')
    console.log(`\n----- draft (${LIVE ? 'live model' : 'stub model'}) -----\n${draft.draft_body}\n-----\n`)

    // What the reviewer sees under "Prices used".
    expect(draft.context_used).toMatchObject({
      template_ids: ['tpl-giza'], travel_date: '2027-03-13', pax: 4, tenant_prompt: true,
    })
    expect(draft.context_used.rates).toBe(
      'Tour: Giza Pyramids & Saqqara Private Day Tour (template tpl-giza)\n' +
      'Public rate, per person, EUR, lowest season: 2 pax 95 · 3 pax 82 · 4 pax 74 · 5–6 pax 66 · 7–8 pax 61\n' +
      'Date-specific (13 Mar 2027, 4 pax): 78',
    )

    if (!LIVE) {
      // The company prompt went out verbatim with the RATES block in place of
      // {{RATES_BLOCK}} — and no built-in prompt text.
      const draftCall = ai.calls.find(c => !c.system.startsWith('You match'))!
      expect(draftCall.system).toContain('Sign as Islam Hussein')
      expect(draftCall.system).toContain('4 pax 74')
      expect(draftCall.system).not.toContain('{{RATES_BLOCK}}')
      expect(draftCall.system).not.toContain('You are an AI reply assistant')
      // "pyramids" alone names no tour, so the one matching call was made —
      // and counted against the company AI ceiling first.
      expect(ai.calls.filter(c => c.system.startsWith('You match'))).toHaveLength(1)
      expect(limits.calls).toContainEqual([T, 'aiCompany'])
    }
  }, 120_000)

  it('NO_DRAFT: stores no draft and records why on the inbox entry', async () => {
    const db = seed('Dear team, please find attached our supplier invoice for October transport.', 'Supplier invoice October')
    const result = await generateDraftReplies({
      supabase: db as never, tenantId: T, channel: 'email', unifiedConversationId: 'conv-1', reviewerUserId: null,
    })
    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(db.tables.communication_drafts).toHaveLength(0)
    expect(db.tables.communication_inbox[0]).toMatchObject({ status: 'skipped' })
    expect(String(db.tables.communication_inbox[0].copilot_skip_reason)).toMatch(/supplier|invoice|not a travel/i)
  }, 120_000)

  it('a company on the built-in prompt is unchanged: two options, no matching call', async () => {
    if (LIVE) return
    const db = seed(ENQUIRY)
    ;(db.tables.tenant_features[0] as Row).copilot_system_prompt = null
    const { createMessageWithRetry } = await import('@/lib/ai/anthropic-client')
    vi.mocked(createMessageWithRetry).mockImplementationOnce(async (p) => {
      ai.calls.push({ system: String(p.system), user: '' })
      return { content: [{ type: 'text', text: '{"drafts":[{"body":"A"},{"body":"B"}],"escalate":{"needed":false}}' }] } as never
    })
    const result = await generateDraftReplies({
      supabase: db as never, tenantId: T, channel: 'email', unifiedConversationId: 'conv-1', reviewerUserId: null, count: 2,
    })
    expect(result.drafts).toHaveLength(2)
    expect(ai.calls).toHaveLength(1)
    expect(ai.calls[0].system).toContain('You are an AI reply assistant')
    expect(limits.calls).toHaveLength(0)
    expect((db.tables.communication_drafts[0] as { context_used: Row }).context_used.rates).toBeUndefined()
  })
})
