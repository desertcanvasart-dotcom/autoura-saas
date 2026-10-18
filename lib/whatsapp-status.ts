// ============================================
// WhatsApp delivery status — Twilio's vocabulary onto ours
// ============================================
// whatsapp_messages.status only allows pending / sent / delivered / read /
// failed (019's CHECK). The status callback wrote Twilio's raw MessageStatus,
// so "undelivered", "queued", "accepted", "sending", "receiving" and
// "received" were refused by the CHECK — a message that never arrived stayed
// "sent". And callbacks arrive out of order: a late "sent" overwrote "read"
// (documents audit, round 12).
//
// mapTwilioStatus() maps onto the allowed set; previousStatusesFor() lists the
// statuses a new one may replace, so the update can be conditional and a
// status never moves backwards.

export type WhatsAppMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

const TWILIO_STATUS_MAP: Record<string, WhatsAppMessageStatus> = {
  // Not yet handed to WhatsApp.
  accepted: 'pending',
  scheduled: 'pending',
  queued: 'pending',
  sending: 'pending',
  receiving: 'pending',
  // Handed to WhatsApp.
  sent: 'sent',
  // Reached the device (inbound: reached us).
  delivered: 'delivered',
  received: 'delivered',
  read: 'read',
  // Never arrived.
  failed: 'failed',
  undelivered: 'failed',
  canceled: 'failed',
}

/** Twilio's MessageStatus as one of our statuses; null for one we do not know. */
export function mapTwilioStatus(raw: string | null | undefined): WhatsAppMessageStatus | null {
  const key = String(raw ?? '').trim().toLowerCase()
  return TWILIO_STATUS_MAP[key] ?? null
}

// Progress order. 'failed' sits outside it: it beats pending/sent (the
// message never got further) but never delivered/read (it did arrive).
const RANK: Record<Exclude<WhatsAppMessageStatus, 'failed'>, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

/** Whether `next` may replace `current` — never backwards. */
export function canAdvanceStatus(
  current: WhatsAppMessageStatus | string | null | undefined,
  next: WhatsAppMessageStatus
): boolean {
  if (current === next) return false
  if (current == null) return true
  if (next === 'failed') return current === 'pending' || current === 'sent'
  // Proof the message arrived outranks an earlier failure report.
  if (current === 'failed') return RANK[next] >= RANK.delivered
  const currentRank = RANK[current as keyof typeof RANK]
  if (currentRank === undefined) return true
  return RANK[next] > currentRank
}

const ALL_STATUSES: WhatsAppMessageStatus[] = ['pending', 'sent', 'delivered', 'read', 'failed']

/** The stored statuses `next` may replace — for a `.in('status', …)` guard. */
export function previousStatusesFor(next: WhatsAppMessageStatus): WhatsAppMessageStatus[] {
  return ALL_STATUSES.filter(s => canAdvanceStatus(s, next))
}
