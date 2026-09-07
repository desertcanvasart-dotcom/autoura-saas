// ============================================
// A client's stage: Lead → Customer
// ============================================
// A person who arrives through an email request, a WhatsApp message or a
// concierge brief is a LEAD. The first booking makes them a CUSTOMER — the
// database does that (migration 352, a trigger on bookings), never a click.
// Inactive and blocked are the two ways out. The stored value is `status`;
// 'prospect' was the old word for lead and was re-filed by the same
// migration, so it is read here (old rows in caches) but never written.

export const CLIENT_STAGES = [
  { key: 'lead',     label: 'Lead',     badge: 'bg-primary-100 text-primary-800', hint: 'Asked, nothing booked yet' },
  { key: 'active',   label: 'Customer', badge: 'bg-green-100 text-green-800',     hint: 'Has booked at least once' },
  { key: 'inactive', label: 'Inactive', badge: 'bg-gray-100 text-gray-800',       hint: 'No longer travelling with you' },
  { key: 'blocked',  label: 'Blocked',  badge: 'bg-red-100 text-red-800',         hint: 'Do not do business with' },
] as const
export type ClientStage = (typeof CLIENT_STAGES)[number]['key']

/** The stage a new record starts in. */
export const DEFAULT_CLIENT_STAGE: ClientStage = 'lead'

/** Old spellings still met in the wild, and what they mean now. */
const ALIASES: Record<string, ClientStage> = { prospect: 'lead', blacklisted: 'blocked' }

export function normalizeClientStage(status: string | null | undefined): ClientStage {
  const s = String(status ?? '').trim().toLowerCase()
  if (CLIENT_STAGES.some(st => st.key === s)) return s as ClientStage
  return ALIASES[s] ?? DEFAULT_CLIENT_STAGE
}

export function clientStageLabel(status: string | null | undefined): string {
  const key = normalizeClientStage(status)
  return CLIENT_STAGES.find(st => st.key === key)!.label
}

export function clientStageBadge(status: string | null | undefined): string {
  const key = normalizeClientStage(status)
  return CLIENT_STAGES.find(st => st.key === key)!.badge
}

/** Leads are the people not yet won; customers have booked. */
export function isLead(status: string | null | undefined): boolean { return normalizeClientStage(status) === 'lead' }
export function isCustomer(status: string | null | undefined): boolean { return normalizeClientStage(status) === 'active' }
