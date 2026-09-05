// ============================================
// The org's deposit rule (B-item 7 / A-item 7)
// ============================================
// Every booking used to be born with `deposit_percent = 30` hardcoded in
// the route and a payment deadline of now+7 — while the payment_terms TEXT
// said something else. The rule is the ORG's decision (migration 325:
// tenants.deposit_percent / deposit_due_days); this is its one resolver,
// the same explicit → tenant → default shape as
// lib/pricing/resolve-margin.ts.

export const DEFAULT_DEPOSIT_PERCENT = 30
export const DEFAULT_DEPOSIT_DUE_DAYS = 7

export interface DepositRule {
  depositPercent: number
  depositDueDays: number
  /** Where each figure came from, for display/audit. */
  source: 'explicit' | 'tenant' | 'default'
}

function usable(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

export function resolveDepositRule(input: {
  /** A per-request override (validated by the caller's own bounds check). */
  explicitPercent?: number | null
  tenant?: { deposit_percent?: number | null; deposit_due_days?: number | null } | null
}): DepositRule {
  const explicit = usable(input.explicitPercent, 100)
  const tenantPercent = usable(input.tenant?.deposit_percent, 100)
  const tenantDueDays = usable(input.tenant?.deposit_due_days, 365)

  const depositPercent = explicit ?? tenantPercent ?? DEFAULT_DEPOSIT_PERCENT
  const depositDueDays = tenantDueDays ?? DEFAULT_DEPOSIT_DUE_DAYS

  return {
    depositPercent,
    depositDueDays,
    source: explicit != null ? 'explicit' : tenantPercent != null ? 'tenant' : 'default',
  }
}
