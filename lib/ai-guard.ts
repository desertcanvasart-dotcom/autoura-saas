// ============================================
// A ceiling on AI spend per person and per company
// ============================================
// Every AI route answered as often as it was called, with whatever it was
// sent: one stuck retry loop, a script, or a pasted novel could run up the
// model bill without limit. Plans stay unlimited for now (no monthly quota);
// this is only the safety ceiling — far above real use — plus a cap on how
// much text one request may send.
//
// The company ceiling is counted in the database (migration 427), so it holds
// across deploys and replicas.

import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'

/** Characters of free text one AI request may send. */
export const MAX_AI_INPUT_CHARS = 50_000

/**
 * A 429 when this person or their company is over the AI ceiling, else null.
 * The person's per-minute count is in memory; the company's hourly ceiling is
 * counted in the database (lib/rate-limit-shared.ts), so a deploy does not
 * reset it and every server shares it.
 */
export async function aiBudgetDenied(userId: string, tenantId: string | null | undefined): Promise<NextResponse | null> {
  const person = checkRateLimit(userId, 'ai')
  if (!person.success) return rateLimitResponse(person)
  if (tenantId) {
    const company = await checkSharedRateLimit(tenantId, 'aiCompany')
    if (!company.success) return rateLimitResponse(company)
  }
  return null
}

/** A 413 when `text` is longer than an AI request may send, else null. */
export function aiInputTooLong(text: unknown, max = MAX_AI_INPUT_CHARS): NextResponse | null {
  if (typeof text !== 'string' || text.length <= max) return null
  return NextResponse.json(
    { success: false, error: `That text is too long to process (over ${max.toLocaleString('en-US')} characters). Please shorten it.` },
    { status: 413 },
  )
}
