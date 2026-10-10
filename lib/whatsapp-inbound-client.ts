// ============================================
// Whose client an inbound WhatsApp number is
// ============================================
// The webhook matched the sender's phone against EVERY tenant's clients and
// linked the hit into the conversation whatever its tenant, so tenant A's
// thread got tenant B's client, name and history (documents audit, round 12).
// The webhook now looks only inside the conversation's tenant when there is
// one; this picks from what it found. A number that more than one tenant has
// on file is nobody's to guess — no client.

export interface InboundClientMatch {
  id: string
  full_name: string | null
  tenant_id: string
}

export function pickInboundClient(matches: readonly InboundClientMatch[]): InboundClientMatch | null {
  if (matches.length === 0) return null
  const tenants = new Set(matches.map(m => m.tenant_id))
  return tenants.size === 1 ? matches[0] : null
}
