// ============================================
// The WhatsApp conversation key — one number, one spelling
// ============================================
// The inbound webhook keys whatsapp_conversations by the sender's number with
// a leading "+" (Twilio's "whatsapp:+2010…"). The app stored whatever the
// agency typed, minus punctuation — "2010…" without the "+" — so the
// customer's first reply found no conversation and opened a second one
// (documents audit, round 12). Every conversation write and lookup goes
// through toConversationPhone(); conversationPhoneKeys() also finds the rows
// stored the old way.

/**
 * E.164 with a leading "+": punctuation dropped, "00" read as the
 * international prefix. A number that still starts with a trunk "0" has no
 * country to go with it and is returned as digits only — it cannot be made
 * E.164 here (lib/whatsapp.ts internationalNumber() resolves those with the
 * tenant's country first).
 */
export function toConversationPhone(number: string | null | undefined): string {
  const compact = String(number ?? '').trim().replace(/[^\d+]/g, '')
  const digits = compact.replace(/\+/g, '')
  if (!digits) return ''
  if (compact.startsWith('+')) return '+' + digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  if (digits.startsWith('0')) return digits
  return '+' + digits
}

/** The stored spellings one conversation may carry: "+2010…" and the legacy "2010…". */
export function conversationPhoneKeys(number: string | null | undefined): string[] {
  const key = toConversationPhone(number)
  if (!key) return []
  return key.startsWith('+') ? [key, key.slice(1)] : [key]
}
