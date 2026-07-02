// ============================================
// CONCIERGE BRIEF → COPILOT THREAD PROMOTION
// ============================================
// Bridges the Concierge intake (lib/concierge-brief-intake.ts) into the
// Copilot inbox. Find-or-create a communication_thread keyed on brief_id,
// then surface the brief as a communication_inbox row so the operator sees
// it alongside WhatsApp and email threads.
//
// IDEMPOTENCY — guaranteed at TWO layers:
//   - DB:   partial UNIQUE INDEX idx_communication_threads_brief_id_unique
//           (supabase/migrations/217_concierge_chain_wiring.sql) — at most one
//           thread per brief, enforced at insert time.
//   - Code: find-by-brief-id BEFORE insert; on 23505 race, re-lookup.
//   - Inbox: existing UNIQUE(tenant_id, channel, source_message_id) with the
//           revision encoded in source_message_id — exact replay no-ops, a new
//           revision creates one new inbox row on the SAME thread.
//
// Tenant-scoped: the caller (webhook intake) already resolved the tenant_id,
// so it is passed in rather than re-resolved. Does NOT create itineraries or
// bookings — that is commit-brief-to-itinerary.ts.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'

const PG_UNIQUE_VIOLATION = '23505'

type CopilotChannel = 'whatsapp' | 'email'

export interface PromoteResult {
  threadId: string
  inboxId: string | null
  wasNewThread: boolean
  wasNewInbox: boolean
}

interface BriefRow {
  id: string
  client_id: string | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  preferred_contact: string | null
  brief_summary: string | null
  brief_revision: number | null
  submitted_at: string | null
  received_at: string | null
}

// Derive the messaging channel for the resulting thread. `channel` on
// communication_threads is CHECK-constrained to ('whatsapp','email'), so we
// must pick one. Default to 'email' — Concierge visitors always provide an
// email; phone is optional.
function deriveChannel(preferred: string | null): CopilotChannel {
  return (preferred || '').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'email'
}

function deriveContactInfo(brief: BriefRow, channel: CopilotChannel): string {
  if (channel === 'whatsapp') {
    return brief.visitor_phone || brief.visitor_email || 'unknown'
  }
  return brief.visitor_email || brief.visitor_phone || 'unknown'
}

export async function promoteBriefToThread(
  briefId: string,
  tenantId: string,
  supabase: SupabaseClient
): Promise<PromoteResult> {
  // 1. Read the brief.
  const { data: brief, error: briefErr } = await supabase
    .from('concierge_briefs')
    .select(
      'id, client_id, visitor_name, visitor_email, visitor_phone, preferred_contact, brief_summary, brief_revision, submitted_at, received_at'
    )
    .eq('id', briefId)
    .maybeSingle()

  if (briefErr || !brief) {
    throw new Error(
      `[promote-brief] brief not found: ${briefId}${briefErr ? ` (${briefErr.message})` : ''}`
    )
  }

  const briefRow = brief as BriefRow
  const channel = deriveChannel(briefRow.preferred_contact)
  const contactInfo = deriveContactInfo(briefRow, channel)
  const nowIso = new Date().toISOString()
  const lastMessageAt = briefRow.submitted_at || briefRow.received_at || nowIso
  const revision = briefRow.brief_revision ?? 1

  // 2. Find-or-create thread keyed on brief_id.
  let threadId: string
  let wasNewThread = false

  const { data: existingThread } = await supabase
    .from('communication_threads')
    .select('id, client_id')
    .eq('brief_id', briefId)
    .maybeSingle()

  if (existingThread) {
    threadId = existingThread.id as string
    const update: Record<string, unknown> = {
      last_message_at: lastMessageAt,
      updated_at: nowIso,
    }
    // Backfill client_id/name if the prior insert ran before the client was
    // resolved (best-effort: ingestBrief can return null clientId on failure).
    if (!existingThread.client_id && briefRow.client_id) {
      update.client_id = briefRow.client_id
      update.client_name = briefRow.visitor_name
    }
    const { error: updErr } = await supabase
      .from('communication_threads')
      .update(update)
      .eq('id', threadId)
    if (updErr) {
      console.warn('[promote-brief] thread metadata update failed (non-fatal):', updErr.message)
    }
  } else {
    const { data: created, error: insertErr } = await supabase
      .from('communication_threads')
      .insert({
        tenant_id: tenantId,
        channel,
        client_id: briefRow.client_id,
        client_name: briefRow.visitor_name,
        contact_info: contactInfo,
        subject: 'AI Concierge brief',
        status: 'open',
        urgency: 'normal',
        last_message_at: lastMessageAt,
        message_count: 0,
        brief_id: briefId,
        origin: 'concierge',
      })
      .select('id')
      .single()

    if (insertErr) {
      if (insertErr.code === PG_UNIQUE_VIOLATION) {
        // Race: concurrent webhook just inserted this thread. Re-lookup.
        const { data: raced } = await supabase
          .from('communication_threads')
          .select('id')
          .eq('brief_id', briefId)
          .single()
        if (!raced) {
          throw new Error(
            '[promote-brief] thread insert hit unique violation but re-lookup found no row'
          )
        }
        threadId = raced.id as string
      } else {
        throw insertErr
      }
    } else {
      threadId = (created as { id: string }).id
      wasNewThread = true
    }
  }

  // 3. Inbox row per revision. UNIQUE(tenant_id, channel, source_message_id) on
  // communication_inbox makes this idempotent.
  const sourceMessageId = `concierge:${briefId}:rev${revision}`
  const messageBody =
    briefRow.brief_summary || 'AI Concierge brief received (no summary captured).'
  const messageSnippet = messageBody.slice(0, 200)

  let inboxId: string | null = null
  let wasNewInbox = false

  const { data: existingInbox } = await supabase
    .from('communication_inbox')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', channel)
    .eq('source_message_id', sourceMessageId)
    .maybeSingle()

  if (existingInbox) {
    inboxId = existingInbox.id as string
  } else {
    const { data: insertedInbox, error: inboxErr } = await supabase
      .from('communication_inbox')
      .insert({
        tenant_id: tenantId,
        thread_id: threadId,
        channel,
        source_message_id: sourceMessageId,
        sender_name: briefRow.visitor_name,
        sender_contact: contactInfo,
        message_body: messageBody,
        message_snippet: messageSnippet,
        subject: `AI Concierge brief (rev ${revision})`,
        // 'new' (not 'draft_pending') because Concierge briefs are deliberate-
        // handling: the operator reads the brief and explicitly triggers any
        // draft reply, rather than the auto-draft pipeline firing on arrival.
        status: 'new',
        received_at: briefRow.received_at || briefRow.submitted_at || nowIso,
      })
      .select('id')
      .single()

    if (inboxErr) {
      if (inboxErr.code === PG_UNIQUE_VIOLATION) {
        const { data: raced } = await supabase
          .from('communication_inbox')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('channel', channel)
          .eq('source_message_id', sourceMessageId)
          .maybeSingle()
        inboxId = (raced?.id as string) || null
      } else {
        throw inboxErr
      }
    } else {
      inboxId = (insertedInbox as { id: string }).id
      wasNewInbox = true
    }
  }

  // 4. Refresh thread.message_count to reflect current inbox state.
  const { count } = await supabase
    .from('communication_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)

  if (count !== null) {
    const { error: countErr } = await supabase
      .from('communication_threads')
      .update({ message_count: count, updated_at: nowIso })
      .eq('id', threadId)
    if (countErr) {
      console.warn('[promote-brief] message_count refresh failed (non-fatal):', countErr.message)
    }
  }

  return { threadId, inboxId, wasNewThread, wasNewInbox }
}
