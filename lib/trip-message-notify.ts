// ============================================
// TRIP-MESSAGE NOTIFY (P5) — outcome-recorded office notification
// ============================================
// When a traveller writes on the share page, the office must find out — and
// when it CAN'T find out, that must be visible, not silent. The old path was
// a fire-and-forget push: unconfigured VAPID, zero subscriptions, and a dead
// push service all looked exactly like success.
//
// This module tries push first, falls back to an email to the tenant's
// contact address, and stamps the message row's notify_outcome (migration
// 297) with what actually happened. Never throws — a notification failure
// must never fail the traveller's message.

import { sendPushToTenant, type PushPayload, type PushResult } from '@/lib/push'
import { sendMail, type SendMailResult } from '@/lib/email-send'
import { createAdminClient } from '@/lib/supabase-server'

export type TripNotifyOutcome =
  | 'pending'
  | 'push_sent'
  | 'email_sent'
  | 'no_recipients'
  | 'not_configured'
  | 'failed'

export interface EmailAttempt {
  attempted: boolean
  success: boolean
  /** True when the failure is a setup problem, not a delivery problem. */
  configError?: boolean
}

/**
 * The outcome table, pure and tested:
 *   push sent                       → push_sent (email never attempted)
 *   push unusable, email accepted   → email_sent
 *   nothing configured anywhere     → not_configured
 *   configured but nobody reachable → no_recipients
 *   attempts made, all failed       → failed
 */
export function decideTripNotifyOutcome(
  push: PushResult['outcome'],
  email: EmailAttempt
): TripNotifyOutcome {
  if (push === 'sent') return 'push_sent'
  if (email.attempted && email.success) return 'email_sent'
  if (email.attempted && !email.success) {
    return email.configError && push === 'not_configured' ? 'not_configured' : 'failed'
  }
  // Email never attempted: no contact address on file.
  if (push === 'not_configured') return 'not_configured'
  if (push === 'no_subscriptions') return 'no_recipients'
  return 'failed'
}

export interface TripMessageNotifyInput {
  tenantId: string
  itineraryId: string
  messageId: string
  senderName: string
  tripName: string
  content: string
  appUrl?: string
}

interface NotifyDeps {
  push: (tenantId: string, payload: PushPayload) => Promise<PushResult>
  mail: (input: { to: string; subject: string; html: string; fromName?: string }) => Promise<SendMailResult>
  db: () => {
    from(table: string): {
      select(cols: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown }> } }
      update(patch: Record<string, unknown>): { eq(c: string, v: string): PromiseLike<{ error: unknown }> }
    }
  }
}

const liveDeps = (): NotifyDeps => ({
  push: sendPushToTenant,
  mail: sendMail,
  db: createAdminClient as unknown as NotifyDeps['db'],
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Notify the office of an inbound trip message and stamp the row's
 * notify_outcome. Fire-and-forget safe: never throws, and tolerates a
 * database without migration 297 (the stamp is simply skipped).
 */
export async function notifyTripMessage(
  input: TripMessageNotifyInput,
  deps: NotifyDeps = liveDeps()
): Promise<TripNotifyOutcome> {
  let outcome: TripNotifyOutcome = 'failed'
  try {
    const preview = input.content.length > 120 ? `${input.content.slice(0, 117)}…` : input.content
    const pushResult = await deps.push(input.tenantId, {
      title: `${input.senderName} — ${input.tripName}`,
      body: preview,
      url: `/itineraries/${input.itineraryId}`,
      tag: `trip-msg-${input.itineraryId}`,
    })

    let email: EmailAttempt = { attempted: false, success: false }
    if (pushResult.outcome !== 'sent') {
      const { data: tenant } = await deps.db()
        .from('tenants')
        .select('contact_email, company_name')
        .eq('id', input.tenantId)
        .maybeSingle()
      const contact = (tenant as { contact_email?: string | null } | null)?.contact_email
      if (contact) {
        const result = await deps.mail({
          to: contact,
          subject: `New trip message — ${input.tripName}`,
          html: `
            <p><strong>${escapeHtml(input.senderName)}</strong> wrote on <strong>${escapeHtml(input.tripName)}</strong>:</p>
            <blockquote style="border-left:3px solid #647C47;margin:0;padding:4px 12px;color:#333">${escapeHtml(input.content)}</blockquote>
            <p><a href="${input.appUrl ?? ''}/itineraries/${input.itineraryId}">Open the trip to reply</a></p>
          `,
          fromName: 'Trip messages',
        })
        email = { attempted: true, success: result.success, configError: (result as { configError?: boolean }).configError }
      }
    }

    outcome = decideTripNotifyOutcome(pushResult.outcome, email)
  } catch (err) {
    console.error('[trip-notify] unexpected:', err)
    outcome = 'failed'
  }

  // Stamp the row. A database without migration 297 rejects the column —
  // log and move on; the message itself is already safely stored.
  try {
    const { error } = await deps.db()
      .from('trip_messages')
      .update({ notify_outcome: outcome })
      .eq('id', input.messageId)
    if (error) console.error('[trip-notify] outcome stamp failed (migration 297 pending?):', error)
  } catch (err) {
    console.error('[trip-notify] outcome stamp threw:', err)
  }

  return outcome
}
