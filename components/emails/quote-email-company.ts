// ============================================
// Who a quote email is from
// ============================================
// Both quote emails hard-coded "AUTOURA", "Egypt", hello@getautoura.net,
// +20 10 8091 6066 and "© Autoura by Online Era": every tenant's client got
// the platform's brand, and their replies and calls went to it. The sending
// route passes the tenant's own identity (Settings → Organization); blank
// parts are left out rather than filled with someone else's.

export interface QuoteEmailCompany {
  name?: string | null
  tagline?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
}

/** "📧 a@b.c | 📱 +1 …", or '' when the tenant has neither. */
export function contactLine(c: QuoteEmailCompany | undefined): string {
  return [c?.email ? `📧 ${c.email}` : '', c?.phone ? `📱 ${c.phone}` : '', c?.website ? `🌐 ${c.website}` : '']
    .filter(Boolean)
    .join(' | ')
}

/** A date for the email, or null when there is none (never 1 January 1970 or "Invalid Date"). */
export function emailDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', opts)
}
