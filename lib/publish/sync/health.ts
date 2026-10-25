// ============================================
// Publish sync — each company's health, and when to raise the alarm
// ============================================
// Pure rules over one publish_sync_health row (migration 439), so every
// transition is tested without a database.
//
//   ok       every change so far reached the pages
//   failing  this cycle could not deliver a refresh (renderer down, bad
//            payload…) — shown at once, ALERTED from the second failure in a
//            row, so one blip at 3 a.m. does not wake anyone
//   lagging  a change has been waiting longer than LAG_LIMIT_SECONDS
//   stalled  the worker itself stopped running — set by the watchdog
//            (watchdog.ts), because a dead worker cannot report itself
//
// An alert is sent on entering a bad state, repeated at most every
// REALERT_AFTER_MS while it lasts, and recovery is announced exactly once.

/** The worker runs every 5 minutes (Railway's shortest cron). */
export const SYNC_INTERVAL_SECONDS = 300
/** The promised revalidation window is one interval; a change older than two
 *  has missed it. */
export const LAG_LIMIT_SECONDS = 2 * SYNC_INTERVAL_SECONDS
/** Three missed runs and the worker counts as stopped. */
export const STALL_AFTER_SECONDS = 3 * SYNC_INTERVAL_SECONDS
export const FAILURES_BEFORE_ALERT = 2
export const REALERT_AFTER_MS = 6 * 3600_000

export type SyncStatus = 'ok' | 'lagging' | 'failing' | 'stalled'

export interface HealthRow {
  tenant_id: string
  status: SyncStatus
  enrolled_at: string
  last_event_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  last_error: string | null
  consecutive_failures: number
  lag_seconds: number
  alerted_status: string | null
  alerted_at: string | null
  updated_at: string
}

export interface CycleOutcome {
  /** Why this company's refresh failed this cycle, or null. */
  error: string | null
  /** Age of its oldest change still waiting after the cycle. */
  lagSeconds: number
  /** Newest change seen for it this cycle, if any. */
  lastEventAt: string | null
}

export type AlertKind = 'problem' | 'recovered'

export interface HealthDecision {
  next: HealthRow
  alert: { kind: AlertKind; status: SyncStatus } | null
}

/** The row after one worker cycle, and whether to alert. */
export function nextHealth(prev: HealthRow, outcome: CycleOutcome, now: Date): HealthDecision {
  const iso = now.toISOString()
  const failures = outcome.error ? prev.consecutive_failures + 1 : 0
  const status: SyncStatus = outcome.error ? 'failing' : outcome.lagSeconds > LAG_LIMIT_SECONDS ? 'lagging' : 'ok'
  const next: HealthRow = {
    ...prev,
    status,
    consecutive_failures: failures,
    lag_seconds: Math.max(0, Math.round(outcome.lagSeconds)),
    last_event_at: outcome.lastEventAt ?? prev.last_event_at,
    // "In sync as of": a cycle that delivered everything it had, or had nothing.
    last_success_at: outcome.error ? prev.last_success_at : iso,
    last_failure_at: outcome.error ? iso : prev.last_failure_at,
    last_error: outcome.error ?? (status === 'ok' ? null : prev.last_error),
    updated_at: iso,
  }
  const alertable = status === 'lagging' || (status === 'failing' && failures >= FAILURES_BEFORE_ALERT)
  return withAlert(prev, next, alertable, now)
}

/** The watchdog's verdict: the worker has not run for too long. */
export function markStalled(prev: HealthRow, lastRunAt: string | null, now: Date): HealthDecision {
  const next: HealthRow = {
    ...prev,
    status: 'stalled',
    last_error: lastRunAt ? `the sync worker has not run since ${lastRunAt}` : 'the sync worker has never run',
    updated_at: now.toISOString(),
  }
  return withAlert(prev, next, true, now)
}

function withAlert(prev: HealthRow, next: HealthRow, alertable: boolean, now: Date): HealthDecision {
  const outstanding = prev.alerted_status && prev.alerted_status !== 'ok' ? prev.alerted_status : null
  if (next.status === 'ok') {
    if (!outstanding) return { next, alert: null }
    return { next: { ...next, alerted_status: 'ok', alerted_at: now.toISOString() }, alert: { kind: 'recovered', status: 'ok' } }
  }
  if (!alertable) return { next, alert: null }
  const stale = !prev.alerted_at || now.getTime() - Date.parse(prev.alerted_at) >= REALERT_AFTER_MS
  if (outstanding === next.status && !stale) return { next, alert: null }
  return { next: { ...next, alerted_status: next.status, alerted_at: now.toISOString() }, alert: { kind: 'problem', status: next.status } }
}

/** Whether the worker counts as stopped, given its last recorded run. A
 *  worker that never ran is stopped once the first company has been enrolled
 *  longer than the stall limit. */
export function workerStalled(lastRunAt: string | null, earliestEnrolledAt: string, now: Date): boolean {
  const since = lastRunAt ?? earliestEnrolledAt
  return now.getTime() - Date.parse(since) > STALL_AFTER_SECONDS * 1000
}
