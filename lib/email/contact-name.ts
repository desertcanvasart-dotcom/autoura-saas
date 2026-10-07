// ============================================
// The name a conversation shows
// ============================================
// A conversation took its name from ONE header: the first message's From when
// the customer wrote first, else its To. When the office wrote first to a bare
// address ("To: ayesha@legendtours.co.za"), the conversation was stored with
// no name and listed as "Unknown" (live 2026-10-02) — although the customer's
// own reply, or another header in the thread, carried their name.
//
// Now the name is the display name ANY header in the thread gives for the
// customer's address; failing that, one already stored for that address; and
// the sync fills in conversations stored without one.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

type Header = { name?: string | null; value?: string | null }
type ThreadMessage = { payload?: { headers?: Header[] | null } | null }

/** "John Smith <john@x.com>" → ["John Smith", "john@x.com"]; a bare address has no name. */
function parseMailbox(part: string): { name: string | null; email: string } {
  const m = part.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (!m) return { name: null, email: part.trim().toLowerCase() }
  const name = m[1].trim().replace(/^"(.*)"$/, '$1').trim()
  return { name: name || null, email: m[2].trim().toLowerCase() }
}

/** Split an address list on commas outside quotes ("Smith, John" <j@x.com>). */
function splitAddresses(value: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of value) {
    if (ch === '"') quoted = !quoted
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** A display name is not a name when it is just the address again. */
function usable(name: string | null, email: string): string | null {
  if (!name) return null
  return name.toLowerCase() === email || name.includes('@') ? null : name
}

/**
 * The display name the thread's headers give for `contactEmail`, newest
 * message first (a person's latest signature is the one they chose).
 */
export function contactNameFromThread(messages: ThreadMessage[], contactEmail: string): string | null {
  const target = contactEmail.trim().toLowerCase()
  if (!target) return null
  for (const msg of [...messages].reverse()) {
    for (const h of msg.payload?.headers ?? []) {
      const n = (h.name ?? '').toLowerCase()
      if (n !== 'from' && n !== 'to' && n !== 'cc' && n !== 'reply-to') continue
      for (const part of splitAddresses(h.value ?? '')) {
        const { name, email } = parseMailbox(part)
        if (email === target) {
          const good = usable(name, email)
          if (good) return good
        }
      }
    }
  }
  return null
}

/**
 * What a list shows for a conversation: its name, else the client on record,
 * else the address itself — never "Unknown" when there is an address.
 */
export function conversationTitle(c: {
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  client?: { full_name?: string | null } | null
}): string {
  return (c.contact_name || '').trim()
    || (c.client?.full_name || '').trim()
    || (c.contact_email || '').trim()
    || (c.contact_phone || '').trim()
    || 'Unknown'
}

/**
 * Name the tenant's email conversations stored without one, from the names
 * already on their stored messages. Two narrow queries and one update per
 * conversation named; a failure names nothing rather than failing the sync.
 */
export async function fillMissingContactNames(db: Db, tenantId: string, limit = 200): Promise<number> {
  try {
    const { data: unnamed, error } = await db
      .from('unified_conversations')
      .select('id, contact_email')
      .eq('tenant_id', tenantId)
      .is('contact_name', null)
      .not('contact_email', 'is', null)
      .limit(limit)
    if (error || !unnamed?.length) return 0

    const byEmail = new Map<string, string>()
    for (const c of unnamed as { id: string; contact_email: string }[]) {
      byEmail.set(c.contact_email.trim().toLowerCase(), c.id)
    }
    const emails = [...byEmail.keys()]

    const names = new Map<string, string>()
    // What the customer called themselves wins over what we called them.
    const { data: fromRows } = await db
      .from('email_messages')
      .select('from_email, from_name')
      .eq('tenant_id', tenantId)
      .in('from_email', emails)
      .not('from_name', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1000)
    for (const r of (fromRows ?? []) as { from_email: string; from_name: string }[]) {
      const e = (r.from_email || '').toLowerCase()
      const good = usable((r.from_name || '').trim() || null, e)
      if (good && !names.has(e)) names.set(e, good)
    }
    const missing = emails.filter(e => !names.has(e))
    if (missing.length) {
      const { data: toRows } = await db
        .from('email_messages')
        .select('to_email, to_name')
        .eq('tenant_id', tenantId)
        .in('to_email', missing)
        .not('to_name', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1000)
      for (const r of (toRows ?? []) as { to_email: string; to_name: string }[]) {
        const e = (r.to_email || '').toLowerCase()
        const good = usable((r.to_name || '').trim() || null, e)
        if (good && !names.has(e)) names.set(e, good)
      }
    }

    let named = 0
    for (const [email, name] of names) {
      const id = byEmail.get(email)
      if (!id) continue
      const { error: upErr } = await db
        .from('unified_conversations')
        .update({ contact_name: name })
        .eq('id', id)
        .is('contact_name', null)
      if (!upErr) named++
    }
    return named
  } catch {
    return 0
  }
}
