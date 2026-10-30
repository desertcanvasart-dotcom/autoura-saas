import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readEscalation } from '@/lib/copilot-suggest'
import { ROUTE_PERMISSIONS, permissionRouteFor } from '@/middleware'

// ============================================
// Bugs found while checking the Communicate docs against the app (2026-10-11).
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
const gate = (p: string) => ROUTE_PERMISSIONS[permissionRouteFor(p) ?? ''] ?? null

describe('an email draft approved in Copilot', () => {
  it('opens in Conversations with the reply filled in, and sending marks it sent', () => {
    const send = src('app/api/copilot/drafts/[id]/send/route.ts')
    expect(send).toContain("open_url: conversationId ? `/conversations?id=${conversationId}` : null")
    const api = src('app/api/ai/suggest-email-reply/route.ts')
    expect(api).toContain(".eq('status', 'approved')")
    expect(api).toContain('body: approvedRow.edited_body || approvedRow.draft_body')
    const composer = src('components/unified/UnifiedConversationComposer.tsx')
    expect(composer).toContain('setAcceptedDraftId(data.approved.id)')
    expect(src('app/conversations/page.tsx')).toContain("new URLSearchParams(window.location.search).get('id')")
    expect(src('components/copilot/CopilotReviewPanel.tsx')).toContain('Open conversation')
  })
})

describe('Copilot', () => {
  it('owners can change its settings', () => {
    expect(src('app/settings/copilot/page.tsx')).toContain("const isAdmin = role === 'admin' || role === 'owner'")
  })

  it('the AI says when a person must take a message, and the banner reads it', () => {
    expect(readEscalation({ needed: true, reason: 'Refund demand' })).toEqual({ escalate: true, escalation_reason: 'Refund demand' })
    expect(readEscalation({ needed: false, reason: 'x' })).toEqual({ escalate: false, escalation_reason: null })
    expect(readEscalation('yes')).toEqual({ escalate: false, escalation_reason: null })
    const suggest = src('lib/copilot-suggest.ts')
    expect(suggest.match(/"escalate": \{ "needed": true \| false/g)?.length).toBe(2)
    expect(suggest).toContain('...(escalation.escalate ? escalation : {}),')
  })

  it('analytics count an unsent email draft as email', () => {
    const route = src('app/api/copilot/analytics/route.ts')
    expect(route).toContain('const ch = r.send_channel || thread?.channel || ')
    expect(route).not.toContain("r.send_channel || 'whatsapp'")
  })
})

describe('pages a viewer does not get', () => {
  it('the Communicate pages and Documents are gated like the sidebar', () => {
    for (const p of ['/conversations', '/concierge-briefs', '/copilot', '/settings/message-templates', '/documents/receipt/x']) {
      expect(gate(p), p).toEqual(['admin', 'manager', 'member'])
    }
    // Content & AI in Settings is for managers and admins (navigation brief, 2026-10-30).
    expect(gate('/settings/ai-prompts')).toEqual(['admin', 'manager'])
    expect(gate('/settings/copilot-knowledge')).toEqual(['admin', 'manager'])
  })
})

describe('the Content Library', () => {
  it('a company can add the standard categories', () => {
    const page = src('app/settings/content-library/page.tsx')
    expect(page).toContain('Object.values(CATEGORY_SCHEMAS).filter(')
    expect(page).toContain("body: JSON.stringify({ name: schema.label, slug: schema.slug, icon: schema.icon")
  })

  it('a prompt template records its {{variables}}, and shows no bare version', () => {
    const route = src('app/api/content-library/prompts/route.ts')
    expect(route).toContain(': promptVariables(user_prompt_template)')
    expect(route).toContain('updates.variables = promptVariables(updates.user_prompt_template)')
    expect(src('app/settings/ai-prompts/page.tsx')).not.toContain('v{p.version}')
  })
})
