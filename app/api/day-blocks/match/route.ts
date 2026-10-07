// ============================================
// POST /api/day-blocks/match — which day block is each day?
// ============================================
// Body: { days: [{ dayNumber, title?, city?, description?, raw? }] }
// Reply: { matches: [{ dayNumber, code, by, confidence, reason }] }
//
// Shorthand first, then Claude, held to the agency's own library
// (lib/day-blocks/match.ts). Read-only: the Grid decides what to do with the
// answer. An agency with no blocks gets no matches, and no AI call.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { createMessageWithRetry, replyText } from '@/lib/ai/anthropic-client'
import { CLAUDE_MODEL } from '@/lib/ai/models'
import { MATCH_SYSTEM, matchDaysToBlocks, matchPrompt, matchSchema, type AiMatchReply, type RawDay } from '@/lib/day-blocks/match'
import { BLOCK_COLS } from '@/lib/day-blocks/access'
import type { DayBlock } from '@/lib/day-blocks/blocks'

export const dynamic = 'force-dynamic'

const MAX_DAYS = 60
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as { days?: unknown }
    const days: RawDay[] = (Array.isArray(body.days) ? body.days : [])
      .slice(0, MAX_DAYS)
      .map((d: Record<string, unknown>) => ({
        dayNumber: Number(d?.dayNumber),
        title: clip(d?.title, 300),
        city: clip(d?.city, 100),
        description: clip(d?.description, 2000),
        raw: clip(d?.raw, 2000),
      }))
      .filter(d => Number.isInteger(d.dayNumber) && d.dayNumber > 0)
    if (days.length === 0) return NextResponse.json({ success: false, error: 'No days to match' }, { status: 400 })

    const { data, error } = await supabase.from('day_blocks').select(BLOCK_COLS).eq('tenant_id', tenant_id).eq('is_active', true).order('code')
    if (error) throw error
    const blocks = (data ?? []) as unknown as DayBlock[]

    const matches = await matchDaysToBlocks(days, blocks, async pending => {
      const prompt = matchPrompt(pending, blocks)
      const response = await createMessageWithRetry({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        // Picking from a list: a little reasoning, not deep thought.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: matchSchema(blocks) } },
        system: MATCH_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            // The library is the same on every call for this agency: cached.
            { type: 'text', text: prompt.library, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: prompt.days },
          ],
        }],
      })
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
        console.error(`[day-blocks/match] no usable reply (stop_reason=${response.stop_reason})`)
        return null
      }
      try {
        return JSON.parse(replyText(response)) as AiMatchReply
      } catch {
        console.error('[day-blocks/match] reply was not valid JSON')
        return null
      }
    })

    return NextResponse.json({ success: true, data: { matches } })
  } catch (error) {
    console.error('POST day-blocks/match error:', error)
    return NextResponse.json({ success: false, error: 'Failed to match the days to your blocks' }, { status: 500 })
  }
}
