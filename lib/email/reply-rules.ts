// ============================================
// Reply, reply all and forward — who, what subject, what quote
// ============================================
// Pure and browser-safe (no Buffer, no MIME): the inbox composer imports it.
// lib/email/compose-mime re-exports it for server code.

import { headerAddresses } from './contact-name'

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
