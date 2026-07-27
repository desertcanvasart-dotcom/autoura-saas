/**
 * Low-level transactional email sender (Resend).
 *
 * Server-only. The single send path shared by the itinerary email route and the
 * invoice payment-reminder flows. Callers build their own subject/html and get
 * back a {success, error} result so they can log failures without depending on
 * an HTTP round-trip to /api/send-email.
 *
 * MIGRATED FROM GMAIL/nodemailer 2026-07-27. The Gmail transport authenticated
 * with an app password on one hardcoded mailbox and had been failing auth, so
 * invoice reminders never sent. Resend was already the transport for quotes,
 * team invites and notifications (lib/email.ts); this brings the last sender
 * onto it, so there is one provider to configure and one place deliverability
 * can break.
 *
 * The interface is deliberately unchanged — bcc, attachments, fromName, and an
 * `authError` flag — so the existing config-problem branch in /api/send-email
 * keeps working. Only the wire changes.
 *
 * ONE BEHAVIOURAL DIFFERENCE worth knowing. Gmail sent AS the operator's own
 * mailbox, so replies landed there. Resend sends from a verified DOMAIN
 * (RESEND_FROM_EMAIL), so a client hitting reply would otherwise reach the
 * platform address and the operator would never see it. Pass `replyTo` to route
 * replies back — the invoice flows do, because a client replying to an invoice
 * is answering the operator, not Autoura.
 */

import { Resend } from 'resend'

export interface MailAttachment {
  filename: string
  /** Base64 by default; set `encoding` for anything else. */
  content: string
  encoding?: BufferEncoding
}

export interface SendMailInput {
  to: string
  subject: string
  html: string
  /** Optional BCC (e.g. a copy to the company mailbox). */
  bcc?: string
  attachments?: MailAttachment[]
  /** Display name on the From header. */
  fromName?: string
  /**
   * Where replies go. Resend sends from a verified domain rather than the
   * operator's mailbox, so without this a client's reply reaches the platform
   * address and the operator never sees it.
   */
  replyTo?: string
}

export interface SendMailResult {
  success: boolean
  messageId?: string
  error?: string
  /**
   * True when the failure is a CONFIGURATION problem the operator must fix —
   * missing or invalid API key, or a from-address whose domain is not verified
   * in Resend — rather than a transient delivery failure. /api/send-email
   * surfaces these differently, because "email is not set up" and "delivery
   * failed" call for different responses.
   */
  authError?: boolean
}

/** `Name <addr@example.com>` or a bare address; returns the bare address. */
export function bareAddress(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim()
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const configuredFrom = process.env.RESEND_FROM_EMAIL

  // Config problems are reported, never swallowed. An invoice reminder that
  // silently does not send is worse than one that fails loudly — that is
  // precisely how this path stayed broken.
  if (!apiKey) {
    const error = 'RESEND_API_KEY is not set — email cannot be sent'
    console.error('sendMail:', error)
    return { success: false, error, authError: true }
  }
  if (!configuredFrom) {
    const error = 'RESEND_FROM_EMAIL is not set — email needs a verified sender address'
    console.error('sendMail:', error)
    return { success: false, error, authError: true }
  }

  // fromName overrides only the DISPLAY name; the address must stay one Resend
  // has verified, or the send is rejected.
  const from = input.fromName
    ? `${input.fromName} <${bareAddress(configuredFrom)}>`
    : configuredFrom

  try {
    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.bcc ? { bcc: input.bcc } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              // Decoded explicitly rather than handing Resend a bare string:
              // callers pass base64 PDFs, and an ambiguous encoding is how an
              // attachment arrives corrupt.
              content: Buffer.from(a.content, a.encoding || 'base64'),
            })),
          }
        : {}),
    })

    if (error) {
      const message = error.message || 'Resend rejected the message'
      // A bad key and an unverified domain are both operator-fixable config.
      const authError = /api key|unauthor|forbidden|not verified|domain/i.test(message)
      console.error('sendMail failed:', message)
      return { success: false, error: message, authError }
    }

    return { success: true, messageId: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('sendMail threw:', message)
    return { success: false, error: message }
  }
}
