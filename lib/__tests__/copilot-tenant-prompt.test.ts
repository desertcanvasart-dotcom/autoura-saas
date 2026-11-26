import { describe, it, expect } from 'vitest'
import { buildPrompt, fillTenantPrompt } from '@/lib/copilot-suggest'

// A company's own email-copilot system prompt (migration 474).

const ctx = {
  transcript: 'Customer (a@b.com):\nHello',
  latestInboundText: 'Hello, a family of 4, pyramids on 13 March',
  latestInboundSubject: 'Pyramids tour',
  threadSubject: 'Pyramids tour',
}
const base = {
  businessName: 'Travel to Egypt',
  channel: 'email' as const,
  tone: 'friendly' as const,
  ctx,
  retrievalContext: '[FAQ] Child rate: 50%',
  count: 2,
  parentDraftId: null,
  instruction: null,
}

describe('buildPrompt — company system prompt', () => {
  it('uses the built-in prompt when none is set', () => {
    const { systemPrompt } = buildPrompt(base)
    expect(systemPrompt).toContain('You are an AI reply assistant for a travel agency named "Travel to Egypt"')
    expect(systemPrompt).toContain('Do NOT invent prices')
    expect(systemPrompt).toContain('Generate exactly 2 distinct draft options')
  })

  it('treats a blank prompt as unset', () => {
    const { systemPrompt } = buildPrompt({ ...base, tenantSystemPrompt: '   \n ' })
    expect(systemPrompt).toContain('You are an AI reply assistant')
  })

  it('uses the company prompt verbatim with the placeholders filled', () => {
    const { systemPrompt } = buildPrompt({
      ...base,
      tenantSystemPrompt: 'Write for {{COMPANY_NAME}} in a {{ TONE }} voice.\n\n## RATES\n\n{{RATES_BLOCK}}\n',
      ratesBlock: 'Tour: Giza (template t1)\nPublic rate, per person, EUR, lowest season: 4 pax 74',
    })
    expect(systemPrompt).toBe('Write for Travel to Egypt in a friendly voice.\n\n## RATES\n\nTour: Giza (template t1)\nPublic rate, per person, EUR, lowest season: 4 pax 74\n')
    expect(systemPrompt).not.toContain('You are an AI reply assistant')
  })

  it('an empty RATES block leaves nothing behind', () => {
    expect(fillTenantPrompt('A {{RATES_BLOCK}} B', { businessName: 'X', tone: 'formal', ratesBlock: '' })).toBe('A  B')
  })

  it('keeps the knowledge results in the user prompt either way', () => {
    const own = buildPrompt({ ...base, tenantSystemPrompt: 'Own prompt' })
    expect(own.userPromptParts.join('\n')).toContain('[FAQ] Child rate: 50%')
    expect(own.userPromptParts.join('\n')).toContain('Latest customer email to reply to')
  })

  it('never applies the company prompt to WhatsApp', () => {
    const { systemPrompt } = buildPrompt({ ...base, channel: 'whatsapp', tenantSystemPrompt: 'Own prompt' })
    expect(systemPrompt).toContain('draft WhatsApp replies')
  })
})
