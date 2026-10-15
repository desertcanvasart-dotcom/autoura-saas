// ============================================
// Building an outgoing Gmail message — To, Cc, Bcc, threading, attachments
// ============================================
// One builder for every path that hands Gmail a raw message: sending
// (/api/gmail/send), saving a draft (/api/gmail/drafts) and, through the
// draft, a scheduled send. Pure — no Gmail, no database — so the rules are
// tested on their own.
//
// The inbox composer only ever had a To field and the send route only wrote
// To and Subject. Cc and Bcc are now real headers. Gmail delivers to the Bcc
// addresses and removes the Bcc header from what recipients receive; a saved
// draft keeps it, so a reopened draft still shows who was Bcc'd.

import { headerAddresses, splitAddresses } from './contact-name'
import { attachmentNameParams, encodeEmailHeader, singleLine } from './mime-header'
import { threadingLines, type ThreadingHeaders } from './threading'

export interface OutgoingAttachment {
  filename: string
  mimeType: string
  /** Base64 (standard alphabet). */
  data: string
}

export interface OutgoingEmail {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  attachments?: OutgoingAttachment[]
  threading?: ThreadingHeaders
}

/** Gmail's own limit on recipients of one message. */
export const MAX_RECIPIENTS = 500

const ADDRESS_RE = /^[^\s@<>",;:()[\]\\]+@[^\s@<>",;:()[\]\\]+\.[^\s@<>",;:()[\]\\]+$/

/**
 * Addresses from a recipient field: a string ("a@x.com, Ann <b@y.com>") or a
 * list of them. Bare, lowercased, de-duplicated; anything that is not an
 * address is reported, not silently dropped.
 */
export function parseRecipients(input: unknown): { valid: string[]; invalid: string[] } {
  const parts = Array.isArray(input) ? input.map(String) : typeof input === 'string' ? [input] : []
  const valid: string[] = []
  const invalid: string[] = []
  for (const part of parts) {
    // Split on ; as well as , — people paste Outlook-style lists.
    for (const piece of part.split(';').flatMap(p => splitAddresses(p))) {
      if (!piece.trim()) continue
      const found = headerAddresses(piece)
      if (found.length === 0) {
        invalid.push(piece.trim())
        continue
      }
      for (const a of found) {
        if (!ADDRESS_RE.test(a)) invalid.push(a)
        else if (!valid.includes(a)) valid.push(a)
      }
    }
  }
  return { valid, invalid }
}

/** Base64 wrapped at 76 characters, as RFC 2045 requires of a body part. */
export function wrapBase64(b64: string): string {
  return (b64.match(/.{1,76}/g) ?? ['']).join('\r\n')
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The message as Gmail's `raw` (base64url RFC 822). */
export function buildRawEmail(email: OutgoingEmail): string {
  const headers = [
    `To: ${email.to.map(singleLine).join(', ')}`,
    ...(email.cc?.length ? [`Cc: ${email.cc.map(singleLine).join(', ')}`] : []),
    ...(email.bcc?.length ? [`Bcc: ${email.bcc.map(singleLine).join(', ')}`] : []),
    `Subject: ${encodeEmailHeader(email.subject)}`,
    ...threadingLines(email.threading ?? {}),
    'MIME-Version: 1.0',
  ]
  // Base64 so a long single-line HTML body (the rich editor writes one) never
  // exceeds the 998-octet line limit strict servers enforce.
  const htmlPart = [
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(email.html ?? '', 'utf8').toString('base64')),
  ]

  const attachments = email.attachments ?? []
  if (attachments.length === 0) return toBase64Url([...headers, ...htmlPart].join('\r\n'))

  const boundary = `autoura_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const lines = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, ...htmlPart]
  for (const a of attachments) {
    const names = attachmentNameParams(a.filename)
    lines.push(
      `--${boundary}`,
      `Content-Type: ${singleLine(a.mimeType) || 'application/octet-stream'}; ${names.name}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; ${names.disposition}`,
      '',
      wrapBase64(String(a.data ?? '').replace(/\s+/g, '')),
    )
  }
  lines.push(`--${boundary}--`)
  return toBase64Url(lines.join('\r\n'))
}

// ============================================
// Reply, reply all, forward
// ============================================

export interface SourceMessage {
  from: string
  to?: string
  cc?: string
  replyTo?: string
  subject?: string
  date?: string
  body?: string
}

/** "Re: x" once — not "Re: Re: x". */
export function replySubject(subject: string | undefined): string {
  const s = (subject ?? '').trim()
  return /^re:/i.test(s) ? s : `Re: ${s}`
}

/** "Fwd: x" once. */
export function forwardSubject(subject: string | undefined): string {
  const s = (subject ?? '').trim()
  return /^(fwd?|fw):/i.test(s) ? s : `Fwd: ${s}`
}

/**
 * Who a reply goes to.
 *
 * Reply: the sender (their Reply-To when they set one). Replying to a message
 * we sent ourselves goes to its original recipients instead, as Gmail does.
 *
 * Reply all: that, plus everyone else on To and Cc — never our own addresses,
 * and nobody twice.
 */
export function replyRecipients(
  msg: SourceMessage,
  isOwn: (address: string) => boolean,
  all: boolean,
): { to: string[]; cc: string[] } {
  const fromAddrs = headerAddresses(msg.replyTo || msg.from)
  const toAddrs = headerAddresses(msg.to)
  const ccAddrs = headerAddresses(msg.cc)
  const sentByUs = headerAddresses(msg.from).some(isOwn)

  const primary = (sentByUs ? toAddrs : fromAddrs).filter(a => !isOwn(a))
  // A note to self (we sent it to ourselves): reply to ourselves.
  const to = primary.length ? primary : sentByUs ? toAddrs : fromAddrs
  if (!all) return { to, cc: [] }

  const seen = new Set(to)
  const cc: string[] = []
  for (const a of [...(sentByUs ? [] : toAddrs), ...ccAddrs]) {
    if (isOwn(a) || seen.has(a)) continue
    seen.add(a)
    cc.push(a)
  }
  return { to, cc }
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The quoted original under a reply. `body` is already-sanitised HTML. */
export function quotedOriginal(msg: SourceMessage): string {
  const when = msg.date ? new Date(msg.date) : null
  const whenText = when && !isNaN(when.getTime()) ? when.toLocaleString() : msg.date ?? ''
  return (
    `<p></p><p>On ${escapeText(whenText)}, ${escapeText(msg.from)} wrote:</p>` +
    `<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${msg.body ?? ''}</blockquote>`
  )
}

/** The forwarded-message block under a forward. `body` is already-sanitised HTML. */
export function forwardedOriginal(msg: SourceMessage): string {
  const rows = [
    ['From', msg.from],
    ['Date', msg.date ?? ''],
    ['Subject', msg.subject ?? ''],
    ['To', msg.to ?? ''],
    ...(msg.cc ? [['Cc', msg.cc]] : []),
  ]
  return (
    '<p></p><p>---------- Forwarded message ---------<br>' +
    rows.map(([k, v]) => `${k}: ${escapeText(v)}`).join('<br>') +
    `</p>${msg.body ?? ''}`
  )
}
