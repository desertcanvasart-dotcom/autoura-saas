// ============================================
// POST /api/pricing-grid/write-days — "Write descriptions"
// ============================================
// Body: {
//   days: GridDay[]            the grid's days, as on screen
//   tier, tourName, pax        the trip's settings
//   mode: 'fill' | 'rewrite'   fill: only days with no description;
//                              rewrite: the days in dayNumbers, replaced
//   dayNumbers?: number[]
// }
// Reply: { written: [{ dayNumber, title, description, sources }], missing }
//
// The days are matched to the agency's Content Library here, without AI
// (lib/ai/day-writer.ts), and Claude writes from those facts and that text in
// the agency's Writing Rules. Read-only: the grid puts the text on the days,
// and the normal save stores it. Counted as an AI generation.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { createMessageWithRetry, getUserFriendlyError, isAiServiceError, replyText } from '@/lib/ai/anthropic-client'
import { CLAUDE_MODEL } from '@/lib/ai/models'
import { gateVolume, incrementVolumeUsage, loadUsageAnchor } from '@/lib/usage-enforcement'
import {
  WRITER_SYSTEM, acceptWritten, isPlaceholderTitle, itineraryRules, matchTrip, styleBlock, writerPrompt, writerSchema,
  type LibraryEntry, type WritingRuleRow,
} from '@/lib/ai/day-writer'
import type { GridDay } from '@/app/pricing-grid/types'
import { aiBudgetDenied } from '@/lib/ai-guard'

export const dynamic = 'force-dynamic'

const MAX_DAYS = 40

interface LibraryRow {
  id: string
  name: string
  location: string | null
  short_description: string | null
  metadata: unknown
  content_categories: { slug: string | null } | null
  content_variations: Array<{
    tier: string; title: string | null; description: string | null
    highlights: string[] | null; day_by_day: unknown; is_active: boolean | null
  }> | null
}

async function loadLibrary(tenantId: string) {
  const admin = createAdminClient()
  const [{ data: rows, error }, { data: rules }] = await Promise.all([
    admin
      .from('content_library')
      .select('id, name, location, short_description, metadata, content_categories(slug), content_variations(tier, title, description, highlights, day_by_day, is_active)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    admin
      .from('writing_rules')
      .select('name, description, rule_type, priority, applies_to, applies_to_tiers, examples, examples_json')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
  ])
  if (error) throw error
  const library: LibraryEntry[] = ((rows ?? []) as unknown as LibraryRow[]).map(r => ({
    id: r.id,
    name: r.name,
    category: r.content_categories?.slug ?? 'general',
    location: r.location,
    short_description: r.short_description,
    variations: (r.content_variations ?? []).filter(v => v.is_active !== false),
  }))
  // Phrases meant for itineraries (or not limited to anywhere).
  const phrases = ((rows ?? []) as unknown as LibraryRow[])
    .filter(r => r.content_categories?.slug === 'phrases-expressions')
    .filter(r => {
      const where = (r.metadata as { use_context?: unknown } | null)?.use_context
      return !Array.isArray(where) || where.length === 0 || where.includes('Itinerary')
    })
    .map(r => String((r.content_variations ?? []).find(v => v.description)?.description ?? r.short_description ?? '').trim())
    .filter(Boolean)
  return { library, rules: (rules ?? []) as WritingRuleRow[], phrases }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const denied = roleDenied(auth.role, 'staff')
    if (denied) return denied
    const { supabase, tenant_id } = auth
    const overBudget = aiBudgetDenied(auth.user!.id, tenant_id)
    if (overBudget) return overBudget

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const days = (Array.isArray(body.days) ? body.days : []).slice(0, MAX_DAYS) as GridDay[]
    if (!days.every(d => d && Number.isInteger(d.dayNumber) && Array.isArray(d.slots))) {
      return NextResponse.json({ success: false, error: 'The days are not in the expected shape' }, { status: 400 })
    }
    const tier = typeof body.tier === 'string' && body.tier ? body.tier : 'standard'
    const mode = body.mode === 'rewrite' ? 'rewrite' : 'fill'
    const only = Array.isArray(body.dayNumbers) ? new Set((body.dayNumbers as unknown[]).map(Number)) : null
    if (mode === 'rewrite' && !only?.size) {
      return NextResponse.json({ success: false, error: 'Say which day to rewrite' }, { status: 400 })
    }

    // Fill never touches a day that already has a description: the team's
    // own words stay unless they ask for a rewrite of that day.
    const targets = days.filter(d =>
      (!only || only.has(d.dayNumber)) &&
      (mode === 'rewrite' || !String(d.description ?? '').trim()))
    if (targets.length === 0) {
      return NextResponse.json({ success: true, data: { written: [], missing: [], note: 'Every day already has a description.' } })
    }

    const gate = await gateVolume(supabase, tenant_id, 'ai_generations', 'AI generations this month')
    if (!gate.ok) return gate.response!

    const { library, rules, phrases } = await loadLibrary(tenant_id)
    // Matched over the WHOLE trip, so a cruise's sailing days count in order.
    const allMatches = matchTrip(days, library, tier)
    const wanted = new Set(targets.map(d => d.dayNumber))
    const matches = allMatches.filter(m => wanted.has(m.facts.dayNumber))
    const dayNumbers = matches.map(m => m.facts.dayNumber)

    const style = styleBlock(itineraryRules(rules, tier), phrases)
    let reply: unknown = null
    try {
      const response = await createMessageWithRetry({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        // Writing from given facts: some care, not deep reasoning.
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: writerSchema(dayNumbers) } },
        system: WRITER_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            // The house style is the same on every call for this agency: cached.
            { type: 'text', text: style, cache_control: { type: 'ephemeral' } },
            {
              type: 'text',
              text: writerPrompt({
                tourName: typeof body.tourName === 'string' ? body.tourName : null,
                tier,
                pax: Math.max(1, Math.floor(Number(body.pax)) || 1),
                matches,
              }),
            },
          ],
        }],
      })
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
        console.error(`[write-days] no usable reply (stop_reason=${response.stop_reason})`)
      } else {
        try { reply = JSON.parse(replyText(response)) } catch { console.error('[write-days] reply was not valid JSON') }
      }
    } catch (error) {
      if (isAiServiceError(error)) {
        const { message, status } = getUserFriendlyError(error)
        return NextResponse.json({ success: false, error: message }, { status })
      }
      throw error
    }

    const written = acceptWritten(reply, dayNumbers)
    if (written.length === 0) {
      return NextResponse.json({ success: false, error: 'The descriptions could not be written — try again.' }, { status: 502 })
    }
    incrementVolumeUsage(tenant_id, 'ai_generations', await loadUsageAnchor(supabase, tenant_id))

    const byDay = new Map(matches.map(m => [m.facts.dayNumber, m]))
    const original = new Map(days.map(d => [d.dayNumber, d]))
    return NextResponse.json({
      success: true,
      ...(gate.usage ? { usage: gate.usage } : {}),
      data: {
        written: written.map(w => {
          const day = original.get(w.dayNumber)!
          // Fill keeps a title the operator chose; a rewrite replaces it.
          const keepTitle = mode === 'fill' && !isPlaceholderTitle(day.title, day.dayNumber, day.city)
          return {
            dayNumber: w.dayNumber,
            title: keepTitle || !w.title ? day.title : w.title,
            description: w.description,
            sources: (byDay.get(w.dayNumber)?.used ?? []).map(u => ({
              name: u.name, kind: u.kind, tier: u.tier, otherTier: u.otherTier,
            })),
          }
        }),
        missing: matches.flatMap(m => m.missing.map(x => ({ dayNumber: m.facts.dayNumber, ...x }))),
      },
    })
  } catch (error) {
    console.error('POST pricing-grid/write-days error:', error)
    return NextResponse.json({ success: false, error: 'Failed to write the descriptions' }, { status: 500 })
  }
}
