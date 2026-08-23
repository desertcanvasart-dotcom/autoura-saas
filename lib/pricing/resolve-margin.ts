// ============================================================================
// The one place that decides what margin a quote carries.
// ============================================================================
// Check 11: "a margin that lives only on the person, not the company".
//
// Margin was stored per user, per B2B partner and per record — but not per
// tenant — and sixteen places each hard-coded `25` as the fallback. Two
// colleagues in the same agency quoted the same trip differently and nobody
// could set the house rate. The constant was also identical for every tenant
// on the platform.
//
// ORDER (migration 279):
//   explicit  the value on the request or the quote record — an operator who
//             typed a number always wins
//   user      user_preferences.default_margin_percent
//   tenant    tenants.default_margin_percent — the house rate
//   constant  DEFAULT_MARGIN_PERCENT, the platform floor
//
// Clearing a personal margin therefore drops you to the company rate, which is
// the behaviour the settings UI implies.
//
// ── Why `Number.isFinite` and not `|| 25` ───────────────────────────────────
// 0 is a legitimate margin: an at-cost trip. `0 || 25` silently resells it at
// 25%, and several call sites did exactly that — including the save route for
// user preferences, so a user who chose 0% had 25% written to their profile.
// app/itineraries/[id]/page.tsx had already learned this and says so in a
// comment; nothing carried the lesson anywhere else. Hence one function.
// ============================================================================

import { DEFAULT_MARGIN_PERCENT } from '@/lib/ai/parsing-utils'

export type MarginSource = 'explicit' | 'user' | 'tenant' | 'constant'

export interface MarginResolution {
  marginPercent: number
  /** Where the number came from — surfaced so a quote can explain itself. */
  source: MarginSource
}

export interface MarginInputs {
  /** From the request body or the quote record. */
  explicit?: number | string | null
  /** user_preferences.default_margin_percent */
  userDefault?: number | string | null
  /** tenants.default_margin_percent */
  tenantDefault?: number | string | null
}

/** A margin is "set" only if it is a real, non-negative number. */
function usable(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  // A negative margin is a data error, not a discount — fall through rather
  // than sell below cost on a typo.
  return n < 0 ? null : n
}

export function resolveMarginPercent(inputs: MarginInputs): MarginResolution {
  const explicit = usable(inputs.explicit)
  if (explicit !== null) return { marginPercent: explicit, source: 'explicit' }

  const user = usable(inputs.userDefault)
  if (user !== null) return { marginPercent: user, source: 'user' }

  const tenant = usable(inputs.tenantDefault)
  if (tenant !== null) return { marginPercent: tenant, source: 'tenant' }

  return { marginPercent: DEFAULT_MARGIN_PERCENT, source: 'constant' }
}
