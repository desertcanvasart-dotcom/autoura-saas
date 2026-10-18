// ============================================
// Mail rules — matching and what a match does
// ============================================
// Pure: which emails a rule matches, and the Gmail label change the matching
// rules add up to. The sync applies them to new mail; "Apply to Inbox now"
// finds existing mail with gmailQueryFor() and applies the same change.
// See migration 422.

export interface RuleConditions {
  /** The From header contains this (address or name). */
  from?: string
  /** To or Cc contains this. */
  to?: string
  /** The subject contains this. */
  subject?: string
  /** Every one of these words (or "quoted phrases") is in the subject or body. */
  words?: string
}

export interface RuleActions {
  /** File it in this folder (by name; created in a mailbox that lacks it). */
  folder?: string
  skipInbox?: boolean
  markRead?: boolean
  star?: boolean
  spam?: boolean
  delete?: boolean
}

export interface MailRule {
  id: string
  name: string
  enabled: boolean
  conditions: RuleConditions
  actions: RuleActions
}

export interface RuleMessage {
  from: string
  to: string
  cc?: string
  subject: string
  /** Plain text of the body (or the snippet). */
  text: string
}

const TEXT_LIMIT = 200

function clean(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT) : ''
}

/** A rule as stored: trimmed, only known fields, or the reason it is unusable. */
export function normaliseRule(input: { name?: unknown; conditions?: unknown; actions?: unknown }):
  | { ok: true; name: string; conditions: RuleConditions; actions: RuleActions }
  | { ok: false; error: string } {
  const c = (input.conditions ?? {}) as Record<string, unknown>
  const a = (input.actions ?? {}) as Record<string, unknown>
  const conditions: RuleConditions = {}
  for (const k of ['from', 'to', 'subject', 'words'] as const) {
    const v = clean(c[k])
    if (v) conditions[k] = v
  }
  const actions: RuleActions = {}
  const folder = clean(a.folder)
  if (folder) actions.folder = folder
  for (const k of ['skipInbox', 'markRead', 'star', 'spam', 'delete'] as const) {
    if (a[k] === true) actions[k] = true
  }
  if (Object.keys(conditions).length === 0) return { ok: false, error: 'Add at least one condition (from, to, subject or words)' }
  if (Object.keys(actions).length === 0) return { ok: false, error: 'Choose at least one thing for the rule to do' }
  if (actions.spam && actions.delete) return { ok: false, error: 'A rule can send to Spam or delete, not both' }
  const name = clean(input.name) || describeConditions(conditions)
  return { ok: true, name, conditions, actions }
}

export function describeConditions(c: RuleConditions): string {
  const parts = [
    c.from && `from ${c.from}`,
    c.to && `to ${c.to}`,
    c.subject && `subject "${c.subject}"`,
    c.words && `has "${c.words}"`,
  ].filter(Boolean)
  return `Emails ${parts.join(', ')}`.slice(0, TEXT_LIMIT)
}

/** Words and "quoted phrases", lowercased. */
export function splitWords(words: string): string[] {
  const out: string[] = []
  const re = /"([^"]+)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(words))) out.push((m[1] ?? m[2]).toLowerCase())
  return out
}

export function matchesRule(conditions: RuleConditions, msg: RuleMessage): boolean {
  const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase())
  if (conditions.from && !has(msg.from, conditions.from)) return false
  if (conditions.to && !has(`${msg.to} ${msg.cc ?? ''}`, conditions.to)) return false
  if (conditions.subject && !has(msg.subject, conditions.subject)) return false
  if (conditions.words) {
    const hay = `${msg.subject} ${msg.text}`.toLowerCase()
    if (!splitWords(conditions.words).every(w => hay.includes(w))) return false
  }
  return Object.keys(conditions).length > 0
}

export interface RulePlan {
  /** Folder names to file the email in. */
  folders: string[]
  addLabelIds: string[]
  removeLabelIds: string[]
  /** Spam or Trash: the email leaves the mailbox's working view entirely. */
  removed: boolean
}

/**
 * What every matching rule adds up to. Delete wins over everything, then
 * Spam; otherwise the folders, star, read and skip-Inbox combine.
 */
export function planFor(rules: MailRule[], msg: RuleMessage): RulePlan | null {
  const hits = rules.filter(r => r.enabled && matchesRule(r.conditions, msg))
  return hits.length === 0 ? null : planFromActions(hits.map(r => r.actions))
}

/** The label change a set of rule actions adds up to. */
export function planFromActions(actions: RuleActions[]): RulePlan {
  const hits = actions.map(a => ({ actions: a }))
  if (hits.some(r => r.actions.delete)) {
    return { folders: [], addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'], removed: true }
  }
  if (hits.some(r => r.actions.spam)) {
    return { folders: [], addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'], removed: true }
  }
  const folders = [...new Set(hits.map(r => r.actions.folder).filter((f): f is string => Boolean(f)))]
  const add = new Set<string>()
  const remove = new Set<string>()
  for (const r of hits) {
    if (r.actions.star) add.add('STARRED')
    if (r.actions.markRead) remove.add('UNREAD')
    if (r.actions.skipInbox) remove.add('INBOX')
  }
  return { folders, addLabelIds: [...add], removeLabelIds: [...remove], removed: false }
}

/** A Gmail search value: quoted, with quotes inside removed. */
function q(v: string): string {
  return `"${v.replace(/"/g, ' ').trim()}"`
}

/**
 * The Gmail search for "Apply to Inbox now": the rule's conditions, within
 * the Inbox. Gmail's search matches words rather than any substring, so it
 * can find slightly less than the sync's matcher; it never finds mail
 * outside the Inbox.
 */
export function gmailQueryFor(c: RuleConditions): string {
  const parts = ['in:inbox']
  if (c.from) parts.push(`from:${q(c.from)}`)
  if (c.to) parts.push(`{to:${q(c.to)} cc:${q(c.to)}}`)
  if (c.subject) parts.push(`subject:${q(c.subject)}`)
  if (c.words) for (const w of splitWords(c.words)) parts.push(q(w))
  return parts.join(' ')
}

/** Plain text from Gmail message parts, for the words condition. */
export function messageText(payload: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] | null } | null | undefined, snippet = ''): string {
  const chunks: string[] = []
  const walk = (p: typeof payload) => {
    if (!p) return
    const data = p.body?.data
    if (data && (p.mimeType === 'text/plain' || p.mimeType === 'text/html')) {
      const raw = Buffer.from(data, 'base64').toString('utf8')
      chunks.push(p.mimeType === 'text/html' ? raw.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ') : raw)
    }
    for (const c of (p.parts ?? []) as Array<typeof payload>) walk(c)
  }
  walk(payload)
  return (chunks.join(' ') || snippet).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').slice(0, 20_000)
}
