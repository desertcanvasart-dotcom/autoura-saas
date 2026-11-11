// ============================================
// Mail the office's own website sends on a traveller's behalf
// ============================================
// A website form (an "Itinerary request", seen live 2026-11-11) emails the
// office FROM an office address (concierge@ on the company's own domain)
// TO an office address (info@ / hello@), with
// the traveller in Reply-To ("Reply to this email to reach the traveller").
//
// Sync decides direction from the From alone, so every such request read as
// the office writing to itself: the thread had no customer address in To and
// was skipped whole — the enquiry never reached the inbox, only our reply did.
//
// The rule: when the From is the office, every recipient is the office (or
// there is none), and the Reply-To names someone outside the office, that
// person is the sender. Anything else — a colleague forwarding mail by hand,
// staff writing to a client, an internal note — is unchanged.
//
// Pure, and safe to use in the browser.

import { headerAddresses } from './contact-name'
import { isOfficeAddress, type OfficeRule } from './office-addresses'

export interface SenderHeaders {
  from?: string | null
  to?: string | null
  cc?: string | null
  replyTo?: string | null
}

/** The outside person a form relayed this message for, or null when it was not relayed. */
export function relayedSender(office: OfficeRule, h: SenderHeaders): string | null {
  const from = headerAddresses(h.from)[0]
  if (!from || !isOfficeAddress(office, from)) return null

  const recipients = [...headerAddresses(h.to), ...headerAddresses(h.cc)]
  if (recipients.some(a => !isOfficeAddress(office, a))) return null

  const outside = headerAddresses(h.replyTo).find(a => !isOfficeAddress(office, a))
  return outside ? outside.toLowerCase() : null
}

export interface EffectiveSender {
  direction: 'inbound' | 'outbound'
  /** The address to file the message under as its sender ('' when none). */
  email: string
  /** True when a form wrote on this person's behalf. */
  relayed: boolean
}

/** Who really wrote this message, and which way it goes. */
export function effectiveSender(office: OfficeRule, h: SenderHeaders): EffectiveSender {
  const relayed = relayedSender(office, h)
  if (relayed) return { direction: 'inbound', email: relayed, relayed: true }
  const from = headerAddresses(h.from)[0] ?? ''
  if (!h.from) return { direction: 'inbound', email: from, relayed: false }
  return { direction: isOfficeAddress(office, from) ? 'outbound' : 'inbound', email: from, relayed: false }
}
