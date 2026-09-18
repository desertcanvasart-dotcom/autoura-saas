// ============================================
// A travel request becomes a Lead
// ============================================
// Mail that arrives is judged ONCE, when its conversation is first created: is
// this somebody asking us about a trip? If it is, they become a client at
// status 'lead' with source 'email', linked to the conversation — the same row
// the inbox's manual "create client" makes today, without waiting for somebody
// to press it. A booking later promotes them to Customer (migration 362).
//
// What it must not do is fill the CRM with rubbish. Three guards, before the
// model is asked anything:
//
//   1. The sender is already a client — nothing to create.
//   2. The sender was dismissed before (migration 368) — "not a lead" is
//      remembered, or the same wrong lead returns on the next sync.
//   3. The sender is the office itself, or an obvious no-reply/bounce address.
//
// The model is asked only about what survives that, and only once per
// conversation. An unreadable or absent answer creates NOTHING: a missing lead
// is a nuisance, an invented one is work.
//
// Ported from the sibling app (travel-ops-pro #468).

import { createMessageWithRetry, replyText } from '@/lib/ai/anthropic-client'
import { CLAUDE_MODEL } from '@/lib/ai/models'
import { isOfficeAddress, bareAddress, type OfficeRule } from './office-addresses'
import { isAutomatedSender } from './automated-senders'

/** Support desks and the big platforms' info@ — not automated exactly, but
 *  nobody there is asking us for a trip either. The no-reply family lives in
 *  lib/email/automated-senders.ts, shared with the waiting-on-us list. */
const NEVER_A_LEAD = /^(support|info@(?:facebook|google|linkedin|twitter|x)\.com)/i

export interface LeadCandidate {
  fromEmail: string
  fromName?: string | null
  subject?: string | null
  body?: string | null
}

export interface LeadJudgement {
  isRequest: boolean
  /** What the model made of it, for the record. */
  reason: string
}

/** Should this sender be judged at all? Cheap checks, no model call. */
export function worthJudging(
  candidate: { fromEmail: string },
  context: { office: OfficeRule; knownClientEmails: ReadonlySet<string>; dismissedEmails: ReadonlySet<string> }
): boolean {
  const from = bareAddress(candidate.fromEmail)
  if (!from.includes('@')) return false
  if (isOfficeAddress(context.office, from)) return false
  if (context.knownClientEmails.has(from)) return false
  if (context.dismissedEmails.has(from)) return false
  if (isAutomatedSender(from)) return false
  const local = from.split('@')[0]
  if (NEVER_A_LEAD.test(local) || NEVER_A_LEAD.test(from)) return false
  return true
}

/** The name to file a new lead under: the display name, else the local part. */
export function leadName(candidate: LeadCandidate): { first_name: string; last_name?: string } {
  const display = String(candidate.fromName ?? '').trim()
  const fallback = bareAddress(candidate.fromEmail).split('@')[0]
  const [first, ...rest] = (display || fallback).split(/\s+/)
  return { first_name: first || fallback, ...(rest.length ? { last_name: rest.join(' ') } : {}) }
}

const PROMPT = `You read the first message of an email conversation that reached a tour operator in Egypt.

Answer ONLY whether this person is asking about travel — a trip, a quote, a tour, dates, availability, a booking they want to make. That includes a short or vague enquiry ("do you do Nile cruises in March?").

It is NOT a travel request when the message is:
- a supplier, hotel or airline writing to the operator
- an invoice, statement, receipt or payment notice
- marketing, a newsletter, or an automated notification
- a job application or a CV
- a colleague's internal message
- spam

Reply with JSON only: {"isRequest": true|false, "reason": "<up to 12 words>"}`

/**
 * Ask the model whether this is somebody asking about a trip.
 *
 * Returns null when the answer cannot be read — no key, an outage, or a reply
 * that is not the JSON asked for. The caller creates nothing on null: a
 * missing lead is a nuisance, an invented one is work someone has to undo.
 */
export async function judgeLead(candidate: LeadCandidate): Promise<LeadJudgement | null> {
  const body = String(candidate.body ?? '').slice(0, 4000)
  const subject = String(candidate.subject ?? '').slice(0, 300)
  if (!body.trim() && !subject.trim()) return null

  try {
    // The shared client: one place retries 429/529 and one place names the
    // model (lib/ai/anthropic-client, lib/ai/models).
    const response = await createMessageWithRetry({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      system: PROMPT,
      messages: [
        {
          role: 'user',
          content: `From: ${candidate.fromName || ''} <${candidate.fromEmail}>\nSubject: ${subject}\n\n${body}`,
        },
      ],
    })
    return readJudgement(response)
  } catch {
    return null
  }
}

/** The model's answer, or null when it cannot be read. Exported for tests. */
export function readJudgement(response: unknown): LeadJudgement | null {
  // replyText joins the TEXT blocks: the answer can sit behind a thinking
  // block, which reading only the first block would miss. A response without
  // the expected shape is unreadable, not a crash — the caller creates
  // nothing, which is the safe direction.
  let text: string
  if (typeof response === 'string') {
    text = response
  } else if (Array.isArray((response as { content?: unknown })?.content)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    text = replyText(response as any)
  } else {
    return null
  }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { isRequest?: unknown; reason?: unknown }
    if (typeof parsed.isRequest !== 'boolean') return null
    return { isRequest: parsed.isRequest, reason: String(parsed.reason ?? '').slice(0, 200) }
  } catch {
    return null
  }
}
