// What a WhatsApp status message (app/api/whatsapp/send-status) does to the
// trip it is about. Every message used to write itself into
// itineraries.status: the "payment reminder" turned a confirmed trip into
// 'pending_payment' and "paid" into 'paid' — statuses no trip list or report
// counts, so the trip dropped out of them. The status moves only where the
// message says it has, and never off a finished trip.

export type StatusMessage = 'confirmed' | 'cancelled' | 'pending_payment' | 'paid' | 'completed'

/** The status a trip moves to after a status message, or null to leave it. */
export function statusAfterMessage(current: string | null | undefined, message: StatusMessage): string | null {
  const now = String(current ?? '')
  if (now === 'cancelled' || now === 'completed') return null
  if (message === 'confirmed') return now === 'draft' || now === 'sent' ? 'confirmed' : null
  if (message === 'completed' || message === 'cancelled') return message
  return null
}

