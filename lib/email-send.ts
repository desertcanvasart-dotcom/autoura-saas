/**
 * Low-level transactional email sender (Gmail via nodemailer).
 *
 * Server-only. This is the single send path shared by the itinerary email
 * route and the invoice payment-reminder flows. Callers build their own
 * subject/html and get back a {success, error} result so they can log
 * failures without depending on an HTTP round-trip to /api/send-email.
 */

import nodemailer from 'nodemailer'

export interface MailAttachment {
  filename: string
  content: string
  encoding?: string
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
}

export interface SendMailResult {
  success: boolean
  messageId?: string
  error?: string
  /** True when the failure was a Gmail auth problem (misconfigured app password). */
  authError?: boolean
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const user = process.env.GMAIL_USER || 'info@travel2egypt.org'

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass: process.env.GMAIL_APP_PASSWORD, // App-specific password
      },
    })

    const info = await transporter.sendMail({
      from: { name: input.fromName || 'Travel2Egypt.org', address: user },
      to: input.to,
      bcc: input.bcc,
      subject: input.subject,
      html: input.html,
      attachments: (input.attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: a.encoding || 'base64',
      })),
    })

    return { success: true, messageId: info.messageId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const authError = message.includes('Invalid login')
    console.error('sendMail failed:', message)
    return { success: false, error: message, authError }
  }
}
