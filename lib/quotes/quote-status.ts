// ============================================
// The statuses a quote can have
// ============================================
// Every route that writes a status stored whatever it was sent: "Acepted"
// from a typo, or anything a script posted, then matched no filter, no count
// and no "accepted" check (conversion), and the quote fell out of sight.

export const B2C_QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'] as const
export const B2B_QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const

export function isQuoteStatus(type: 'b2c' | 'b2b', status: unknown): boolean {
  const list: readonly string[] = type === 'b2c' ? B2C_QUOTE_STATUSES : B2B_QUOTE_STATUSES
  return typeof status === 'string' && list.includes(status)
}

export function quoteStatusError(type: 'b2c' | 'b2b'): string {
  return `Status must be one of: ${(type === 'b2c' ? B2C_QUOTE_STATUSES : B2B_QUOTE_STATUSES).join(', ')}`
}
