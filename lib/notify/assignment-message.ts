// ============================================
// The assignment message the office sends from its own WhatsApp
// ============================================
// Meta lets a business number start a conversation only with a pre-approved
// template; free text is allowed for 24 hours after the other side last wrote.
// Until templates are wired, the office hands assignments over from its OWN
// WhatsApp (wa.me deep link with the text pre-typed) — no Meta rules apply to
// a person pressing send. This is that text: everything the driver, guide or
// assistant needs, plus their no-login check-in link. Pure, so tested.

export interface AssignmentMessageInput {
  /** The person's name as recorded; only the first name is used. */
  name?: string | null
  agency?: string | null
  tripName?: string | null
  clientName?: string | null
  startDate?: string | null
  endDate?: string | null
  travelers?: number | null
  notes?: string | null
  /** The staff check-in link (/staff/<token>). */
  url: string
}

function day(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function buildAssignmentMessage(m: AssignmentMessageInput): string {
  const first = m.name?.trim().split(/\s+/)[0] || 'there'
  const lines: string[] = [`Hello ${first},`, '']
  lines.push(m.agency?.trim() ? `New assignment from ${m.agency.trim()}:` : 'You have a new assignment:')
  if (m.tripName?.trim()) lines.push(`🧭 Trip: ${m.tripName.trim()}`)
  if (m.startDate) {
    const end = m.endDate && m.endDate.slice(0, 10) !== m.startDate.slice(0, 10) ? ` – ${day(m.endDate)}` : ''
    lines.push(`📅 Date: ${day(m.startDate)}${end}`)
  }
  if (m.clientName?.trim()) lines.push(`👤 Client: ${m.clientName.trim()}`)
  if (m.travelers && m.travelers > 0) lines.push(`👥 Guests: ${m.travelers}`)
  if (m.notes?.trim()) lines.push(`📝 Notes: ${m.notes.trim()}`)
  lines.push('', 'Please reply to confirm. On the day, tap the buttons on this link at each step (no login needed):', m.url)
  return lines.join('\n')
}

// ============================================
// Someone typed in by hand
// ============================================
// The assignment modal saves an outside driver or assistant as
// "Name · +20 100 … (outside)" — they have no directory row to look a phone
// up in. This reads the name and phone back out of that.

export function parseManualAssignee(resourceName: string | null | undefined): { name: string; phone: string | null } | null {
  const m = /^(.*?)(?:\s+·\s+(.+?))?\s+\(outside\)\s*$/.exec(resourceName ?? '')
  if (!m || !m[1].trim()) return null
  return { name: m[1].trim(), phone: m[2]?.trim() || null }
}
