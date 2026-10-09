/**
 * What a quote send writes back. b2b_quotes has no sent_at / sent_via (only
 * b2c_quotes does, migration 001): sending both made PostgREST reject the
 * whole update, so a rate sheet that went out stayed 'draft'. Only a draft
 * becomes 'sent' — re-sending an accepted quote must not demote it.
 * Returns null when there is nothing to write.
 */
export function quoteSentUpdate(
  type: 'b2c' | 'b2b',
  currentStatus: unknown,
  via: 'email' | 'whatsapp' | 'whatsapp_ai',
  now: Date = new Date()
): Record<string, string> | null {
  const status = String(currentStatus ?? '')
  const update: Record<string, string> = status === '' || status === 'draft' ? { status: 'sent' } : {}
  if (type === 'b2c') {
    update.sent_at = now.toISOString()
    update.sent_via = via
  }
  return Object.keys(update).length ? update : null
}
