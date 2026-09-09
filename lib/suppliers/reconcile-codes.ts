// Phase 4 of the portable supplier_code work: the one-time reconciliation.
//
// The other install (travel-ops-pro) has assigned every supplier a SUP-####
// code. This install already HAS those same suppliers, but under its own UUIDs
// and slightly different names — so to make the shared code actually bridge the
// two, each existing supplier here must be stamped with its counterpart's code.
//
// Names vary too much to match on, so this pairs on the stabler keys — email
// then phone — and stamps the code only on a single confident match. Anything
// ambiguous, unmatched, or conflicting is reported for the operator to pair by
// hand. This module is the pure decision layer; the route applies the plan.

export interface IncomingSupplier {
  /** The portable code from the other install (SUP-0001). Required. */
  code: string
  name?: string
  email?: string
  phone?: string
}

export interface ExistingSupplier {
  id: string
  company_name?: string | null
  email?: string | null
  phone?: string | null
  supplier_code?: string | null
}

export type ReconcileRow =
  // A single existing supplier matched — stamp `code` onto `supplier_id`.
  | { status: 'match'; code: string; supplier_id: string; via: 'email' | 'phone'; existingName: string; incomingName?: string }
  // The existing supplier already carries exactly this code — nothing to do.
  | { status: 'already'; code: string; supplier_id: string; existingName: string }
  // More than one existing supplier matched — the operator must choose.
  | { status: 'ambiguous'; code: string; incomingName?: string; candidates: Array<{ id: string; name: string }> }
  // No existing supplier matched on email or phone.
  | { status: 'no_match'; code: string; incomingName?: string; email?: string; phone?: string }
  // Can't stamp safely: the matched supplier already has a DIFFERENT code, or
  // this code is already used by another supplier here.
  | { status: 'conflict'; code: string; supplier_id?: string; incomingName?: string; reason: string }

export interface ReconcilePlan {
  rows: ReconcileRow[]
  summary: { total: number; match: number; already: number; ambiguous: number; no_match: number; conflict: number }
}

const normEmail = (s: string | null | undefined): string => (s ?? '').toLowerCase().trim()
/** Phone compared on digits only, last 9 kept so +20/0 country/trunk prefixes
 *  and spacing don't defeat a real match. Empty when too short to be a phone. */
const normPhone = (s: string | null | undefined): string => {
  const digits = (s ?? '').replace(/\D/g, '')
  return digits.length >= 7 ? digits.slice(-9) : ''
}
const normCode = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()

export function planReconciliation(
  incoming: IncomingSupplier[],
  existing: ExistingSupplier[],
): ReconcilePlan {
  const byEmail = new Map<string, ExistingSupplier[]>()
  const byPhone = new Map<string, ExistingSupplier[]>()
  const idsByCode = new Map<string, string[]>() // existing suppliers that already hold a given code
  for (const s of existing) {
    const e = normEmail(s.email)
    if (e) (byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push(s)
    const p = normPhone(s.phone)
    if (p) (byPhone.get(p) ?? byPhone.set(p, []).get(p)!).push(s)
    const c = normCode(s.supplier_code)
    if (c) (idsByCode.get(c) ?? idsByCode.set(c, []).get(c)!).push(s.id)
  }

  const rows: ReconcileRow[] = []
  for (const inc of incoming) {
    const code = (inc.code ?? '').trim()
    if (!code) continue // a row without a code can't be reconciled

    // Union of matches on email and phone, de-duplicated by supplier id.
    const hits = new Map<string, { s: ExistingSupplier; via: 'email' | 'phone' }>()
    const e = normEmail(inc.email)
    if (e) for (const s of byEmail.get(e) ?? []) if (!hits.has(s.id)) hits.set(s.id, { s, via: 'email' })
    const p = normPhone(inc.phone)
    if (p) for (const s of byPhone.get(p) ?? []) if (!hits.has(s.id)) hits.set(s.id, { s, via: 'phone' })

    const matched = [...hits.values()]
    if (matched.length === 0) {
      rows.push({ status: 'no_match', code, incomingName: inc.name, email: inc.email, phone: inc.phone })
      continue
    }
    if (matched.length > 1) {
      rows.push({
        status: 'ambiguous',
        code,
        incomingName: inc.name,
        candidates: matched.map((m) => ({ id: m.s.id, name: m.s.company_name ?? '' })),
      })
      continue
    }

    const { s, via } = matched[0]
    const existingCode = normCode(s.supplier_code)
    const name = s.company_name ?? ''
    if (existingCode === normCode(code)) {
      rows.push({ status: 'already', code, supplier_id: s.id, existingName: name })
      continue
    }
    if (existingCode) {
      rows.push({ status: 'conflict', code, supplier_id: s.id, incomingName: inc.name, reason: `matched supplier already has code "${s.supplier_code}"` })
      continue
    }
    // Target has no code yet — but is this code already used by someone else here?
    const holders = (idsByCode.get(normCode(code)) ?? []).filter((id) => id !== s.id)
    if (holders.length > 0) {
      rows.push({ status: 'conflict', code, supplier_id: s.id, incomingName: inc.name, reason: `code "${code}" is already used by another supplier here` })
      continue
    }
    rows.push({ status: 'match', code, supplier_id: s.id, via, existingName: name, incomingName: inc.name })
  }

  const summary = {
    total: rows.length,
    match: rows.filter((r) => r.status === 'match').length,
    already: rows.filter((r) => r.status === 'already').length,
    ambiguous: rows.filter((r) => r.status === 'ambiguous').length,
    no_match: rows.filter((r) => r.status === 'no_match').length,
    conflict: rows.filter((r) => r.status === 'conflict').length,
  }
  return { rows, summary }
}

/** Header-tolerant field pluck from a parsed CSV row. The travel-ops supplier
 *  export uses Code/Name/Email/Phone (and WhatsApp); accept the snake_case
 *  variants too so either app's sheet works. */
export function readIncomingRow(raw: Record<string, string | undefined>): IncomingSupplier {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const hit = Object.keys(raw).find((h) => h.trim().toLowerCase() === k)
      if (hit && (raw[hit] ?? '').trim()) return (raw[hit] as string).trim()
    }
    return ''
  }
  return {
    code: pick('code', 'supplier_code'),
    name: pick('name', 'company_name', 'supplier_name') || undefined,
    email: pick('email', 'contact_email') || undefined,
    // WhatsApp is often the reachable number when phone is blank — fall through.
    phone: pick('phone', 'contact_phone', 'whatsapp') || undefined,
  }
}
