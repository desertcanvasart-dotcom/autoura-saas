// ============================================
// Recording that a scheduled job ran
// ============================================
// S3 of docs/plans/self-hosted-support.md (read its correction header). The
// scheduler lives outside the app, so the only way to answer "have the jobs
// ever run here?" is for the jobs themselves to say so.
//
// FAIL-OPEN, ALWAYS. Losing a bookkeeping row must never fail the work it was
// describing — a support feature that breaks exchange-rate refreshes would be
// worse than no support feature. Every write here is wrapped and swallowed,
// matching the fail-open telemetry convention in lib/usage-limits.ts.

import { redactText, STALE_AFTER_HOURS } from '@/lib/support/bundle'

/** The vocabulary, owned by job-names.mjs so the scheduler, the bundle and the
 *  doctor script cannot drift apart. Every scheduled job appears exactly once. */
import { JOB_NAMES as NAMES } from './job-names.mjs'
export const JOB_NAMES: readonly string[] = NAMES
export type JobName =
  | 'exchange-rates'
  | 'agent-memory'
  | 'reminders'
  | 'task-reminders'
  | 'purge-traveller-documents'

export { STALE_AFTER_HOURS }

/** Rows older than this are removed as each job runs. The table answers "when
 *  did this last run?" and nothing else; a year of history serves no reader. */
const KEEP_DAYS = 30

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export interface JobRunSummary {
  name: string
  lastRun: string | null
  lastOutcome: string | null
}

/**
 * Run the job's work, recording that it happened.
 *
 * The row is written BEFORE the work and completed after, so a process killed
 * mid-run leaves `started_at` with no `finished_at` — which reads correctly as
 * "it began and never reported back" rather than as "it never ran".
 */
export async function recordJobRun<T>(
  db: DbClient,
  name: JobName,
  work: () => Promise<T>
): Promise<T> {
  let runId: string | null = null
  try {
    const { data } = await db
      .from('job_runs')
      .insert({ job_name: name, started_at: new Date().toISOString() })
      .select('id')
      .single()
    runId = (data?.id as string) ?? null
  } catch {
    // The table may not exist yet (migration 307 unapplied). The job still runs.
  }

  const finish = async (outcome: 'ok' | 'failed', detail?: unknown) => {
    if (!runId) return
    try {
      await db
        .from('job_runs')
        .update({
          finished_at: new Date().toISOString(),
          outcome,
          // Already redacted, and short: this table is read into a file the
          // customer sends us.
          detail: detail == null ? null : redactText(detail).slice(0, 300),
        })
        .eq('id', runId)
      await db
        .from('job_runs')
        .delete()
        .eq('job_name', name)
        .lt('started_at', new Date(Date.now() - KEEP_DAYS * 86400000).toISOString())
    } catch {
      // Bookkeeping only. Never let it change what the caller sees.
    }
  }

  try {
    const result = await work()
    await finish('ok')
    return result
  } catch (err) {
    await finish('failed', err instanceof Error ? err.message : err)
    throw err
  }
}

/**
 * The latest run of every known job, for the support bundle.
 *
 * A job that has never run appears with nulls rather than being left out —
 * "never ran" is the finding, and a missing row would hide it.
 */
export async function latestJobRuns(db: DbClient): Promise<JobRunSummary[]> {
  const latest = new Map<string, { lastRun: string | null; lastOutcome: string | null }>()
  try {
    const { data } = await db
      .from('job_runs')
      .select('job_name, started_at, outcome')
      .order('started_at', { ascending: false })
      .limit(200)
    for (const row of data ?? []) {
      if (latest.has(row.job_name)) continue
      latest.set(row.job_name, { lastRun: row.started_at, lastOutcome: row.outcome ?? 'unfinished' })
    }
  } catch {
    // No table, no rows — every job reports as never run, which is true enough
    // for the reader: nothing here has recorded a run.
  }

  return JOB_NAMES.map(name => ({
    name,
    lastRun: latest.get(name)?.lastRun ?? null,
    lastOutcome: latest.get(name)?.lastOutcome ?? null,
  }))
}

/** Has this job gone quiet? Null lastRun is "never", handled separately. */
export function isStale(lastRun: string | null, now: Date = new Date()): boolean {
  if (!lastRun) return false
  const then = Date.parse(lastRun)
  if (!Number.isFinite(then)) return false
  return now.getTime() - then > STALE_AFTER_HOURS * 3600000
}

/**
 * Wrap a cron route handler so that running it is recorded.
 *
 * One line per route, and the handler's body is untouched — which matters
 * because these jobs are the ones nobody notices when they stop, and a
 * refactor is exactly how that starts.
 *
 * The outcome comes from the RESPONSE STATUS, not from whether the handler
 * threw: these routes report failure as a 500 body rather than by throwing, and
 * a run that answered 500 is a failed run.
 *
 * An unauthenticated probe (401) is not a run and leaves nothing behind — the
 * start row is removed again. A run that never answers at all keeps its
 * start row with no finish, which reads correctly as "began, never reported".
 */
export function withJobRun<A extends unknown[]>(
  name: JobName,
  getDb: () => DbClient,
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    let runId: string | null = null
    const db = safeDb(getDb)
    if (db) {
      try {
        const { data } = await db
          .from('job_runs')
          .insert({ job_name: name, started_at: new Date().toISOString() })
          .select('id')
          .single()
        runId = (data?.id as string) ?? null
      } catch {
        // Table absent (migration 307 unapplied), or the database is down. The
        // job must still run — that is the whole fail-open rule.
      }
    }

    try {
      const response = await handler(...args)
      if (db && runId) {
        if (response.status === 401) {
          // Somebody probed the endpoint. Not a run.
          await db.from('job_runs').delete().eq('id', runId).then(undefined, () => {})
        } else {
          await finishRun(db, runId, response.ok ? 'ok' : 'failed', response.ok ? null : `HTTP ${response.status}`)
          await pruneOldRuns(db, name)
        }
      }
      return response
    } catch (err) {
      if (db && runId) {
        await finishRun(db, runId, 'failed', err instanceof Error ? err.message : err)
      }
      throw err
    }
  }
}

function safeDb(getDb: () => DbClient): DbClient | null {
  try {
    return getDb()
  } catch {
    // A lazily-built admin client throws when the env is not configured.
    return null
  }
}

async function finishRun(db: DbClient, runId: string, outcome: 'ok' | 'failed', detail: unknown) {
  try {
    await db
      .from('job_runs')
      .update({
        finished_at: new Date().toISOString(),
        outcome,
        // Already redacted, and short: this table is read into a file the
        // customer sends us.
        detail: detail == null ? null : redactText(detail).slice(0, 300),
      })
      .eq('id', runId)
  } catch {
    // Bookkeeping only. Never let it change what the caller sees.
  }
}

async function pruneOldRuns(db: DbClient, name: JobName) {
  try {
    await db
      .from('job_runs')
      .delete()
      .eq('job_name', name)
      .lt('started_at', new Date(Date.now() - KEEP_DAYS * 86400000).toISOString())
  } catch {
    // Nothing here is worth failing a job over.
  }
}
