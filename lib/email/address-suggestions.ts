// ============================================
// Address suggestions for To / Cc / Bcc
// ============================================
// Ranking the candidates the contacts route gathers. Pure, so it is tested.

export interface AddressCandidate {
  email: string
  name: string | null
  source: 'emailed' | 'client' | 'team'
  /** When we last exchanged mail (emailed only), for ordering. */
  lastAt?: string | null
}

export const MAX_SUGGESTIONS = 8

/**
 * Best first: a match at the start of the address or of a word in the name,
 * then anywhere; within that, people we have emailed (most recent first),
 * then clients, then the team. One entry per address; addresses already on
 * the message are left out.
 */
export function rankSuggestions(
  candidates: AddressCandidate[],
  query: string,
  exclude: readonly string[] = [],
): AddressCandidate[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const skip = new Set(exclude.map(e => e.trim().toLowerCase()))
  const best = new Map<string, AddressCandidate & { score: number }>()
  const sourceRank = { emailed: 0, client: 1, team: 2 } as const

  for (const c of candidates) {
    const email = (c.email || '').trim().toLowerCase()
    if (!email.includes('@') || skip.has(email)) continue
    const name = (c.name || '').trim()
    const words = name.toLowerCase().split(/\s+/)
    const starts = email.startsWith(q) || words.some(w => w.startsWith(q)) || name.toLowerCase().startsWith(q)
    const contains = email.includes(q) || name.toLowerCase().includes(q)
    if (!starts && !contains) continue
    const score = (starts ? 0 : 10) + sourceRank[c.source]
    const prev = best.get(email)
    const candidate = { ...c, email, name: name || prev?.name || null, score }
    if (!prev || score < prev.score || (score === prev.score && (c.lastAt ?? '') > (prev.lastAt ?? ''))) {
      best.set(email, candidate)
    } else if (!prev.name && name) {
      prev.name = name
    }
  }

  return [...best.values()]
    .sort((a, b) => a.score - b.score || (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.email.localeCompare(b.email))
    .slice(0, MAX_SUGGESTIONS)
    .map(c => ({ email: c.email, name: c.name, source: c.source, ...(c.lastAt !== undefined ? { lastAt: c.lastAt } : {}) }))
}

/** The address being typed: the text after the last comma or semicolon. */
export function currentToken(value: string): { before: string; token: string } {
  const i = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'))
  return { before: i >= 0 ? value.slice(0, i + 1) : '', token: value.slice(i + 1).trim() }
}

/** The field after picking a suggestion: the token replaced, ready for the next. */
export function applySuggestion(value: string, email: string): string {
  const { before } = currentToken(value)
  const lead = before ? `${before.trimEnd()} ` : ''
  return `${lead}${email}, `
}
