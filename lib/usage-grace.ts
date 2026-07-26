// ============================================
// GRACE BANDS — volume limits must not wall someone mid-season
// ============================================
// Structural limits (seats, partners) hard-block at 100%: adding a seat is a
// planned decision. Volume limits are different. A DMC in February peak,
// quoting a waiting client, hitting "annual limit reached" is a churn event —
// we would be blocking the thing that makes them money at the moment it makes
// them money, in a small market where that story travels.
//
// So volume metrics warn, then allow overage, then stop at a buffer:
//
//     < 80%    ok        silent
//    >= 80%    warning   in-app notice, non-blocking
//   >= 100%    overage   ALLOWED, persistent notice, alert the operator
//   >= 125%    blocked   creation stops, upgrade path shown
//
// 125% is deliberate: on Solo that is 120 -> 150 itineraries, enough that a
// peak month cannot wall someone, small enough that it cannot quietly become
// a free tier. The sales conversation triggers at 100%, not at the stop.

export type UsageBand = 'ok' | 'warning' | 'overage' | 'blocked'

/** Fraction of the limit at which the operator is warned. */
export const WARN_AT = 0.8
/** Fraction at which overage begins — allowed, but surfaced and alerted. */
export const OVERAGE_AT = 1.0
/** Fraction at which creation finally stops. */
export const HARD_STOP_AT = 1.25

export interface BandAssessment {
  band: UsageBand
  /** Creation permitted? True for everything except `blocked`. */
  allowed: boolean
  /** current / limit. null when the limit is unlimited. */
  ratio: number | null
  /** How many more can be created before the hard stop. null = unbounded. */
  remainingBeforeStop: number | null
  /** True once past 100% — the operator is over their plan but still working. */
  inOverage: boolean
}

const UNLIMITED: BandAssessment = {
  band: 'ok',
  allowed: true,
  ratio: null,
  remainingBeforeStop: null,
  inOverage: false,
}

/**
 * Classify usage against a limit.
 *
 * `current` is what already exists; the question being answered is whether
 * ONE MORE may be created. At exactly the limit the answer is still yes —
 * that is the overage band, not the stop.
 */
export function classifyUsage(current: number, limit: number | null): BandAssessment {
  if (limit === null) return UNLIMITED
  if (!Number.isFinite(current) || current < 0) return UNLIMITED

  // A zero limit is a real, immediate stop — not "unlimited", and not a
  // division by zero producing Infinity or NaN.
  if (limit <= 0) {
    return { band: 'blocked', allowed: false, ratio: Infinity, remainingBeforeStop: 0, inOverage: true }
  }

  const ratio = current / limit
  const stopAt = limit * HARD_STOP_AT
  const remainingBeforeStop = Math.max(0, Math.ceil(stopAt - current))

  if (ratio >= HARD_STOP_AT) {
    return { band: 'blocked', allowed: false, ratio, remainingBeforeStop: 0, inOverage: true }
  }
  if (ratio >= OVERAGE_AT) {
    return { band: 'overage', allowed: true, ratio, remainingBeforeStop, inOverage: true }
  }
  if (ratio >= WARN_AT) {
    return { band: 'warning', allowed: true, ratio, remainingBeforeStop, inOverage: false }
  }
  return { band: 'ok', allowed: true, ratio, remainingBeforeStop, inOverage: false }
}

/**
 * Operator-facing wording for a band. Deliberately plain: an overage is a
 * conversation, not an error, and a stop must say what to do next.
 */
export function describeBand(
  assessment: BandAssessment,
  opts: { metricLabel: string; current: number; limit: number | null }
): string | null {
  const { metricLabel, current, limit } = opts

  switch (assessment.band) {
    case 'ok':
      return null
    case 'warning':
      return `You have used ${current} of ${limit} ${metricLabel} on your plan.`
    case 'overage':
      return `You are over your plan's ${metricLabel} (${current} of ${limit}). Everything still works — let's talk about the right plan.`
    case 'blocked':
      return `You have reached the limit for ${metricLabel} (${current}, plan allows ${limit}). Existing records stay available; upgrade to create more.`
  }
}

/** True when crossing into this band should notify the operator. */
export function shouldAlert(previous: UsageBand | null, next: UsageBand): boolean {
  if (next === 'ok') return false
  // Alert on entry to a band, not on every action within it.
  return previous !== next
}
