// ============================================
// Addresses nobody is waiting behind
// ============================================
// A no-reply address does not expect an answer. Two features need to know:
// lead detection must not turn a Twilio notification into a customer, and the
// "waiting on us" list must not fill with them.
//
// Checked against the live data on 2026-09-18: of the 12 conversations the
// waiting list showed, the oldest five were donotreply@twilio.com,
// noreply@twilio.com, ads-noreply@google.com and
// verifymyaccount@twilio.zendesk.com — none of them a customer waiting 38 days
// for an answer. A list that cries wolf is a list nobody reads.
//
// Matched on the address's LOCAL part (before the @), where the name must be a
// word of its own: "ads-noreply@google.com" is a robot, "systemaxx@" and
// "newton@" are people. Plus the domains services send from. Pure, and safe in
// the browser.

const TOKENS = [
  'no[-_.]?reply',
  'do[-_.]?not[-_.]?reply',
  'postmaster',
  'mailer[-_.]?daemon',
  'mail[-_.]?delivery',
  'bounce[sd]?',
  'notifications?',
  'alerts?',
  'billing',
  'invoices?',
  'newsletter',
  'news',
  'marketing',
  'automated',
  'system',
  'admin',
  'root',
  'verifymyaccount',
].join('|')

/** The word, bounded by a separator, a digit, or the ends of the local part. */
const AUTOMATED = new RegExp(`(?:^|[-._+])(?:${TOKENS})(?:[-._+0-9]|$)`, 'i')

/** The whole-address cases: a service whose local part looks human. */
const AUTOMATED_ADDRESSES = /@(mailer|notifications?|email|mail|bounces?|reply)\./i

export function isAutomatedSender(value: string | null | undefined): boolean {
  const address = String(value ?? '').trim().toLowerCase()
  if (!address.includes('@')) return false
  const local = address.split('@')[0]
  return AUTOMATED.test(local) || AUTOMATED_ADDRESSES.test(address)
}

/**
 * The moment a HUMAN has been waiting since — null when nobody is.
 *
 * The database stamps `awaiting_reply_since` on any inbound message
 * (migration 366); it cannot tell a customer from a robot. This is the single
 * place that decides, so the inbox badge, the "waiting on us" filter and the
 * dashboard item can never disagree with each other.
 */
export function waitingSince(
  contactEmail: string | null | undefined,
  awaitingReplySince: string | null | undefined
): string | null {
  if (!awaitingReplySince) return null
  if (isAutomatedSender(contactEmail)) return null
  return awaitingReplySince
}
