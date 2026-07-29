/**
 * System email transport.
 *
 * For server-generated mail that has no "sending user" — staff notifications,
 * invoice reminders, invitations — do NOT use /api/gmail/send: that route
 * sends FROM a specific user's connected Gmail account (it requires a userId
 * to look up OAuth tokens) and is meant for human-composed replies. System
 * mail has no such user.
 *
 * Instead we send through Resend, the same transport the working quote-send
 * path uses (app/api/quotes/[type]/[id]/send). It needs only a verified
 * from-address and RESEND_API_KEY — no per-user OAuth, no cookie-authed
 * self-fetch.
 */

import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!_resend) _resend = new Resend(apiKey)
  return _resend
}

export interface SystemEmailInput {
  to: string
  subject: string
  html: string
  /** Optional override; defaults to RESEND_FROM_EMAIL. */
  from?: string
  /** Reply-To — e.g. the prospect's address on contact-form mail, so a
   *  plain reply in the inbox goes to the sender, not to our system from. */
  replyTo?: string
}

export interface SystemEmailResult {
  sent: boolean
  skipped?: boolean
  id?: string
  error?: string
}

/**
 * Send a system email via Resend. Returns a result object rather than throwing
 * on a missing API key so best-effort callers (e.g. notifications) don't fail
 * their primary operation — but a genuine send FAILURE does throw so the caller
 * can log it (no more silently returning success on a 400, per the audit).
 */
export async function sendSystemEmail(input: SystemEmailInput): Promise<SystemEmailResult> {
  const resend = getResend()
  if (!resend) {
    console.warn('sendSystemEmail: RESEND_API_KEY not set — email skipped')
    return { sent: false, skipped: true }
  }

  const from = input.from || process.env.RESEND_FROM_EMAIL || 'Autoura <notifications@autoura.com>'

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  })

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`)
  }

  return { sent: true, id: data?.id }
}
