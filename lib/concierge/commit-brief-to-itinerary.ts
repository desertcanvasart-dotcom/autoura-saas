// ============================================
// CONCIERGE BRIEF → ITINERARY COMMIT
// ============================================
// Operator-triggered. Takes a Concierge-origin communication_threads row,
// finds its brief, and creates an itineraries row with the brief's structured
// fields populated and `thread_id` set so the provenance chain
// (thread → itinerary → booking) is queryable in a single JOIN.
//
// IDEMPOTENCY — both layers:
//   - DB:   partial UNIQUE INDEX idx_itineraries_thread_id_unique
//           (supabase/migrations/217_concierge_chain_wiring.sql) — at most one
//           itinerary per thread.
//   - Code: find-by-thread-id BEFORE insert; on 23505 race, re-lookup.
//
// PROVENANCE TO BRIEF IS TRANSITIVE.
//   itineraries.thread_id → communication_threads.id; brief reached via
//   thread.brief_id.
//
// SCOPE — closes the chain. Does NOT generate a day-by-day plan here. The
// committed itinerary carries the brief's structured fields (client, dates,
// pax, trip name) so the operator can open it in the editor and use the
// existing AI itinerary tooling to fill out days.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'

const PG_UNIQUE_VIOLATION = '23505'

export interface CommitResult {
  itineraryId: string
  itineraryCode: string
  tripName: string
  briefId: string | null
  wasNewItinerary: boolean
}

// Minimal shape we read from the Concierge brief. Maps 1:1 to columns on
// concierge_briefs (supabase/migrations/215_concierge_briefs.sql).
interface ConciergeBrief {
  id: string
  client_id: string | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  language: string | null
  destinations: unknown // JSONB — array of strings or richer objects
  trip_length_days: number | null
  dates_specific: string | null // ISO date (start)
  dates_window: unknown // JSONB
  travelers_count: number | null
  brief_summary: string | null
}

function deriveTripName(brief: ConciergeBrief): string {
  // Best-effort label from destinations + length. Falls back gracefully.
  const dests = Array.isArray(brief.destinations) ? brief.destinations : []
  const destLabel = dests
    .map((d) => (typeof d === 'string' ? d : (d as { name?: string })?.name))
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')
  const nights = brief.trip_length_days ?? 0
  if (destLabel && nights > 0) return `${destLabel} — ${nights} day trip`
  if (destLabel) return `${destLabel} trip`
  if (nights > 0) return `${nights} day trip`
  return 'Concierge trip'
}

function deriveStartEnd(brief: ConciergeBrief): { start_date: string; end_date: string; total_days: number } {
  const days = brief.trip_length_days && brief.trip_length_days > 0 ? brief.trip_length_days : 7
  // start_date: dates_specific if present else today + 30 days (a plausible
  // placeholder the operator will edit). end_date: start + (days - 1).
  const start = brief.dates_specific
    ? new Date(brief.dates_specific)
    : (() => {
        const d = new Date()
        d.setUTCDate(d.getUTCDate() + 30)
        return d
      })()
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + Math.max(0, days - 1))
  return {
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
    total_days: days,
  }
}

function generateItineraryCode(): string {
  // itinerary_code is VARCHAR(50) UNIQUE NOT NULL with no DB default, so the
  // app must supply it. Timestamp in base36 keeps collisions vanishingly rare;
  // the partial-unique index on thread_id is the real idempotency guard.
  return `CON-${Date.now().toString(36).toUpperCase()}`
}

export async function commitBriefToItinerary(
  threadId: string,
  tenantId: string,
  supabase: SupabaseClient
): Promise<CommitResult> {
  // 1. Load the thread — must be Concierge-origin and carry a brief_id.
  const { data: thread, error: threadErr } = await supabase
    .from('communication_threads')
    .select('id, origin, brief_id, client_id, client_name')
    .eq('id', threadId)
    .maybeSingle()
  if (threadErr || !thread) {
    throw new Error(
      `[commit-brief] thread not found: ${threadId}${threadErr ? ` (${threadErr.message})` : ''}`
    )
  }
  if (thread.origin !== 'concierge') {
    throw new Error(
      `[commit-brief] thread ${threadId} has origin='${thread.origin}', expected 'concierge'`
    )
  }
  if (!thread.brief_id) {
    throw new Error(`[commit-brief] thread ${threadId} has no brief_id`)
  }

  // 2. Idempotency — return existing itinerary if one is already linked.
  const { data: existingItin } = await supabase
    .from('itineraries')
    .select('id, itinerary_code, trip_name')
    .eq('thread_id', threadId)
    .maybeSingle()
  if (existingItin) {
    return {
      itineraryId: existingItin.id as string,
      itineraryCode: existingItin.itinerary_code as string,
      tripName: existingItin.trip_name as string,
      briefId: thread.brief_id as string,
      wasNewItinerary: false,
    }
  }

  // 3. Load the brief — its structured fields populate the itinerary row.
  const { data: brief, error: briefErr } = await supabase
    .from('concierge_briefs')
    .select(
      'id, client_id, visitor_name, visitor_email, visitor_phone, language, destinations, trip_length_days, dates_specific, dates_window, travelers_count, brief_summary'
    )
    .eq('id', thread.brief_id)
    .maybeSingle()
  if (briefErr || !brief) {
    throw new Error(
      `[commit-brief] brief not found: ${thread.brief_id}${briefErr ? ` (${briefErr.message})` : ''}`
    )
  }
  const briefRow = brief as ConciergeBrief

  const tripName = deriveTripName(briefRow)
  const { start_date, end_date, total_days } = deriveStartEnd(briefRow)
  const itineraryCode = generateItineraryCode()
  const numAdults = briefRow.travelers_count && briefRow.travelers_count > 0 ? briefRow.travelers_count : 2

  // 4. INSERT. The partial unique index on thread_id will raise 23505 on a
  // concurrent commit — catch it and re-lookup the winning row.
  const { data: created, error: insertErr } = await supabase
    .from('itineraries')
    .insert({
      itinerary_code: itineraryCode,
      tenant_id: tenantId,
      thread_id: threadId,
      client_id: briefRow.client_id ?? thread.client_id ?? null,
      client_name: briefRow.visitor_name ?? thread.client_name ?? 'Unknown',
      client_email: briefRow.visitor_email ?? null,
      client_phone: briefRow.visitor_phone ?? null,
      trip_name: tripName,
      start_date,
      end_date,
      total_days,
      num_adults: numAdults,
      num_children: 0,
      currency: 'EUR',
      total_cost: 0,
      status: 'draft',
      // package_type and tier are intentionally left to default — the operator
      // picks them on the edit page. thread_id is the precise provenance
      // pointer; the brief summary is preserved in notes.
      notes: briefRow.brief_summary ?? null,
    })
    .select('id, itinerary_code, trip_name')
    .single()

  if (insertErr) {
    if (insertErr.code === PG_UNIQUE_VIOLATION) {
      const { data: raced } = await supabase
        .from('itineraries')
        .select('id, itinerary_code, trip_name')
        .eq('thread_id', threadId)
        .single()
      if (!raced) {
        throw new Error(
          '[commit-brief] itinerary insert hit 23505 but re-lookup found no row'
        )
      }
      return {
        itineraryId: raced.id as string,
        itineraryCode: raced.itinerary_code as string,
        tripName: raced.trip_name as string,
        briefId: thread.brief_id as string,
        wasNewItinerary: false,
      }
    }
    throw insertErr
  }

  return {
    itineraryId: (created as { id: string }).id,
    itineraryCode: (created as { itinerary_code: string }).itinerary_code,
    tripName: (created as { trip_name: string }).trip_name,
    briefId: thread.brief_id as string,
    wasNewItinerary: true,
  }
}
