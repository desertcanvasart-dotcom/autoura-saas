// ============================================
// USAGE WINDOWS — computed, never scheduled
// ============================================
// Metered limits (AI generations per month, itineraries per year) need to know
// which window "now" falls in. This module computes that from an anchor date.
//
// WHY COMPUTED RATHER THAN STORED
// -------------------------------
// `tenant_usage` rows are keyed on a `period_start` that only ever advances
// when the STRIPE WEBHOOK writes `tenant_subscriptions.current_period_start`
// (app/api/billing/webhook). A tenant without a Stripe subscription — which is
// every tenant today, and every trial tenant by definition — has a window
// frozen at its start date forever. A "monthly" meter that never resets would
// accumulate until it blocked everyone.
//
// The fix is not another cron. Nothing needs to advance a stored field if the
// window is simply derived from the anchor whenever it is asked for: the
// current window IS whatever the anchor implies today. No job to fail
// silently, no drift between what was scheduled and what is true.
//
// ANCHORING (approved 2026-07-26)
// -------------------------------
// Subscription anniversary, not calendar year: a tenant subscribing in
// November should not have their annual allowance reset six weeks later.
// Anchor = `tenant_subscriptions.current_period_start`, falling back to
// `tenants.created_at`.
//
// MONTH-END CLAMPING, STICKY
// --------------------------
// A period anchored on the 31st runs Jan 31 -> Feb 28 -> Mar 31: the day is
// clamped to each month's length but always re-derived from the ORIGINAL
// anchor day, so it snaps back whenever the month is long enough. Deriving
// each window from the previous one instead would let the anniversary drift
// earlier permanently, costing the customer days every year.
//
// Every boundary is computed in UTC. A window is [start, end): the end instant
// belongs to the next window, so consecutive windows never overlap or gap.

export type WindowKind = 'monthly' | 'annual'

export interface UsageWindow {
  kind: WindowKind
  /** Inclusive. */
  start: Date
  /** Exclusive — this instant is the next window's start. */
  end: Date
}

/** Days in a given UTC month. `month` is 0-indexed. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/**
 * The anchor day-of-month applied to a target month, clamped to that month's
 * length. Time-of-day is carried from the anchor so windows tick over at the
 * same moment, not at midnight.
 */
function anchoredDate(year: number, month: number, anchor: Date): Date {
  const day = Math.min(anchor.getUTCDate(), daysInMonth(year, month))
  return new Date(Date.UTC(
    year,
    month,
    day,
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds()
  ))
}

/**
 * The monthly window containing `now`.
 *
 * Both boundaries are derived from the anchor day applied to consecutive
 * months, which is what makes clamping sticky AND keeps windows contiguous:
 * a Jan-31 anchor gives Jan31->Feb28, then Feb28->Mar31, with no gap between
 * the 28th and the 31st.
 */
function monthlyWindow(anchor: Date, now: Date): UsageWindow {
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth()

  let start = anchoredDate(year, month, anchor)
  if (start.getTime() > now.getTime()) {
    // Not yet reached this month's anniversary — we are still in the previous.
    month -= 1
    if (month < 0) { month = 11; year -= 1 }
    start = anchoredDate(year, month, anchor)
  }

  const nextMonth = month === 11 ? 0 : month + 1
  const nextYear = month === 11 ? year + 1 : year
  return { kind: 'monthly', start, end: anchoredDate(nextYear, nextMonth, anchor) }
}

/**
 * The annual window containing `now`.
 *
 * Same sticky rule across years: a Feb-29 anchor clamps to Feb 28 in common
 * years and returns to Feb 29 in leap years.
 */
function annualWindow(anchor: Date, now: Date): UsageWindow {
  const anchorMonth = anchor.getUTCMonth()
  let year = now.getUTCFullYear()

  let start = anchoredDate(year, anchorMonth, anchor)
  if (start.getTime() > now.getTime()) {
    year -= 1
    start = anchoredDate(year, anchorMonth, anchor)
  }

  return { kind: 'annual', start, end: anchoredDate(year + 1, anchorMonth, anchor) }
}

/**
 * The window of `kind` containing `now`, anchored on `anchor`.
 *
 * Works for an anchor in the future (a subscription starting later): the
 * containing window is then the one that ends at the anchor, so usage recorded
 * before the start date still lands somewhere sane rather than throwing.
 */
export function computeUsageWindow(
  anchor: Date | string,
  kind: WindowKind,
  now: Date | string = new Date()
): UsageWindow {
  const anchorDate = anchor instanceof Date ? anchor : new Date(anchor)
  const nowDate = now instanceof Date ? now : new Date(now)

  if (!Number.isFinite(anchorDate.getTime())) {
    throw new Error(`computeUsageWindow: invalid anchor ${String(anchor)}`)
  }
  if (!Number.isFinite(nowDate.getTime())) {
    throw new Error(`computeUsageWindow: invalid now ${String(now)}`)
  }

  return kind === 'monthly'
    ? monthlyWindow(anchorDate, nowDate)
    : annualWindow(anchorDate, nowDate)
}

/**
 * Which date anchors a tenant's windows.
 *
 * Subscription period start when there is one; otherwise the tenant's creation
 * date, so a pre-billing or trial tenant still gets real, rolling windows
 * rather than a frozen one. Returns null only when neither is known — the
 * caller must then fail OPEN, never block on an unknown window.
 */
export function resolveUsageAnchor(input: {
  subscriptionPeriodStart?: string | Date | null
  tenantCreatedAt?: string | Date | null
}): Date | null {
  for (const candidate of [input.subscriptionPeriodStart, input.tenantCreatedAt]) {
    if (!candidate) continue
    const date = candidate instanceof Date ? candidate : new Date(candidate)
    if (Number.isFinite(date.getTime())) return date
  }
  return null
}

/** `tenant_usage.period_start` / `period_end` values for a window. */
export function windowKeys(window: UsageWindow): { period_start: string; period_end: string } {
  return {
    period_start: window.start.toISOString(),
    period_end: window.end.toISOString(),
  }
}

/** True when `at` falls inside the window. Half-open: [start, end). */
export function isWithinWindow(window: UsageWindow, at: Date | string): boolean {
  const t = (at instanceof Date ? at : new Date(at)).getTime()
  return t >= window.start.getTime() && t < window.end.getTime()
}
