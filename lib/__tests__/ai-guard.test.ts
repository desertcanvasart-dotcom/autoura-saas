import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aiBudgetDenied, aiInputTooLong, MAX_AI_INPUT_CHARS } from '@/lib/ai-guard'
import { RATE_LIMITS } from '@/lib/rate-limit'

// Plans stay unlimited for now; this is only the ceiling on runaway AI spend.

describe('the AI ceiling', () => {
  it('stops one person after the per-minute limit', () => {
    const user = `u-${Math.random()}`
    for (let i = 0; i < RATE_LIMITS.ai.limit; i++) expect(aiBudgetDenied(user, null)).toBeNull()
    expect(aiBudgetDenied(user, null)?.status).toBe(429)
  })

  it('stops a whole company after the hourly limit, across its people', () => {
    const tenant = `t-${Math.random()}`
    let denied = null
    for (let i = 0; i <= RATE_LIMITS.aiCompany.limit && !denied; i++) denied = aiBudgetDenied(`p-${i}-${Math.random()}`, tenant)
    expect(denied?.status).toBe(429)
  })

  it('refuses over-long input', () => {
    expect(aiInputTooLong('x'.repeat(MAX_AI_INPUT_CHARS))).toBeNull()
    expect(aiInputTooLong('x'.repeat(MAX_AI_INPUT_CHARS + 1))?.status).toBe(413)
    expect(aiInputTooLong('x'.repeat(11), 10)?.status).toBe(413)
  })
})

describe('every AI route sits under the ceiling', () => {
  const routes = [
    'app/api/translate/route.ts',
    'app/api/ai/parse-file/route.ts',
    'app/api/ai/parse-whatsapp/route.ts',
    'app/api/ai/parse-supplier-invoice/route.ts',
    'app/api/ai/suggest-reply/route.ts',
    'app/api/ai/suggest-email-reply/route.ts',
    'app/api/copilot/drafts/[id]/regenerate/route.ts',
    'app/api/copilot/knowledge/bulk-import/route.ts',
    'app/api/day-blocks/match/route.ts',
    'app/api/pricing-grid/parse/route.ts',
    'app/api/pricing-grid/write-days/route.ts',
  ]
  for (const r of routes) {
    it(r, () => {
      expect(readFileSync(join(process.cwd(), r), 'utf8')).toContain('aiBudgetDenied(')
    })
  }

  it('translate checks the session itself and caps the text', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/translate/route.ts'), 'utf8')
    expect(src).toContain('await requireAuth()')
    expect(src).toContain('aiInputTooLong(text, MAX_TRANSLATE_CHARS)')
  })
})
