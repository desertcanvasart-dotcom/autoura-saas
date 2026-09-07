// ============================================
// Which emails are business, and which are noise
// ============================================
// Gmail already sorts mail into Primary / Promotions / Social / Updates /
// Forums and hands the category back as a label on every message. The
// inbox's "Business" view and the sync's scope both lean on that, with two
// rules of our own on top:
//
//   * a sender already on record (client, partner, supplier) is ALWAYS
//     business, whatever Gmail filed them under — a real client whose first
//     email lands in Promotions must never vanish;
//   * a machine sender (noreply@, notifications@, mailer-daemon…) is noise
//     unless on record, which catches the system mail Gmail leaves in
//     Updates (Updates itself is kept: hotel and airline confirmations live
//     there).
//
// Pure, so the rules are tested once and shared by the inbox (live Gmail)
// and the sync (stored mail).

/** Gmail's category labels we treat as noise. Updates is deliberately absent. */
export const NOISE_CATEGORY_LABELS = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'] as const

/** The Gmail search operators that exclude the same categories server-side. */
export const NOISE_CATEGORY_QUERY = '-category:promotions -category:social -category:forums'

const MACHINE_LOCAL_PART = /^(no-?reply|do-?not-?reply|notifications?|notify|mailer-daemon|postmaster|alerts?|bounce[s]?|newsletter)([+.-].*)?$/i

/** "Camer David <david.camer@orange.fr>" → "david.camer@orange.fr"; a bare address passes through. */
export function addressOf(fromHeader: string | null | undefined): string {
  const s = String(fromHeader ?? '').trim()
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).trim().toLowerCase()
}

export function isMachineSender(address: string): boolean {
  const local = address.split('@')[0] ?? ''
  return MACHINE_LOCAL_PART.test(local)
}

export interface BusinessCheck {
  from: string | null | undefined
  labelIds?: readonly string[] | null
}

/**
 * Business, or noise? `known` is the set of lower-cased addresses on record.
 * Known senders win outright; then Gmail's category; then the machine rule.
 */
export function isBusinessEmail(email: BusinessCheck, known: ReadonlySet<string>): boolean {
  const address = addressOf(email.from)
  if (address && known.has(address)) return true
  const labels = email.labelIds ?? []
  if (NOISE_CATEGORY_LABELS.some(l => labels.includes(l))) return false
  if (address && isMachineSender(address)) return false
  return true
}

/**
 * Gmail queries for a sync pass. The main query drops the noise categories;
 * the rescue queries fetch, from those same categories, anything sent by a
 * known address, in chunks Gmail's query length is comfortable with.
 */
export function syncQueries(base: string, knownAddresses: readonly string[], chunk = 20): { main: string; rescues: string[] } {
  const main = `${base} ${NOISE_CATEGORY_QUERY}`.trim()
  const rescues: string[] = []
  const addrs = [...new Set(knownAddresses.map(a => a.trim().toLowerCase()).filter(a => a.includes('@')))]
  for (let i = 0; i < addrs.length; i += chunk) {
    const from = addrs.slice(i, i + chunk).map(a => `from:${a}`).join(' OR ')
    rescues.push(`${base} (category:promotions OR category:social OR category:forums) (${from})`.trim())
  }
  return { main, rescues }
}
