// ============================================
// Which email addresses are the office's own
// ============================================
// Sync calls a message OURS only when it comes from the connected mailbox
// exactly. An office writes to customers from more than one address — the
// connected info@ and a colleague's hello@ on the same domain — and every
// reply sent from the second one read as the CUSTOMER writing. The
// conversation then stayed "waiting on us" for a reply that had already gone,
// and the colleague's own address could even become the conversation's
// customer address.
//
// An address is the office's when it is:
//   - the connected mailbox itself
//   - on the connected mailbox's domain — unless that is a public provider
//     (gmail.com and friends), where the domain says nothing about who sent it
//   - listed in Settings → Email → Office addresses
//     (tenants.office_email_addresses, migration 367): a full address
//     ("reservations@partner-office.com") or a whole domain ("agency.com")
//
// Pure, and safe to use in the browser.
// Ported from the sibling app (travel-ops-pro #467).

export const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'gmx.de', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'qq.com',
  '163.com', 'mail.ru', 'web.de', 'orange.fr', 'free.fr', 'wanadoo.fr', 'laposte.net',
])

/** The bare, lower-cased address in "Name <a@b.com>" or "a@b.com". */
export function bareAddress(value: string | null | undefined): string {
  const v = String(value ?? '')
  const m = v.match(/<([^>]+)>/)
  return (m ? m[1] : v).trim().toLowerCase()
}

const domainOf = (address: string): string => (address.includes('@') ? address.split('@').pop()! : '')

/** A Settings entry as typed: an address, or a domain without "@". Null when it is neither. */
export function normaliseOfficeEntry(entry: string): string | null {
  const v = String(entry ?? '').trim().toLowerCase().replace(/^@/, '')
  if (!v) return null
  if (/^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return v
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v)) return v
  return null
}

export interface OfficeRule {
  /** Addresses the rule matches exactly. */
  addresses: string[]
  /** Domains the rule matches. */
  domains: string[]
}

export function officeRule(connectedMailboxes: readonly string[], configured: readonly string[]): OfficeRule {
  const addresses = new Set<string>()
  const domains = new Set<string>()
  for (const m of connectedMailboxes) {
    const a = bareAddress(m)
    if (!a.includes('@')) continue
    addresses.add(a)
    const d = domainOf(a)
    // A connected gmail.com mailbox says nothing about the rest of gmail.com.
    if (d && !PUBLIC_MAIL_DOMAINS.has(d)) domains.add(d)
  }
  for (const e of configured) {
    const n = normaliseOfficeEntry(e)
    if (!n) continue
    if (n.includes('@')) addresses.add(n)
    else domains.add(n)
  }
  return { addresses: [...addresses], domains: [...domains] }
}

export function isOfficeAddress(rule: OfficeRule, value: string | null | undefined): boolean {
  const a = bareAddress(value)
  if (!a.includes('@')) return false
  return rule.addresses.includes(a) || rule.domains.includes(domainOf(a))
}
