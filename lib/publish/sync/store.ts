// ============================================
// Publish sync — where the worker reads and writes
// ============================================
// The worker talks to the database only through this interface, so the same
// cycle runs against Supabase in production and against real Postgres
// (PGlite, with migration 439 applied) in the tests.

import type { ChangeRow } from './events'
import type { HealthRow } from './health'

export interface EnrolledCompany {
  health: HealthRow
  companyName: string | null
}

export interface SyncStore {
  enrolled(): Promise<EnrolledCompany[]>
  /** Unprocessed changes, oldest first. */
  pending(limit: number): Promise<ChangeRow[]>
  /** Delivered (or needing no refresh). `note` explains a row that was not
   *  delivered but must not be retried — a malformed payload. */
  markProcessed(ids: number[], note?: string): Promise<void>
  /** Not delivered: counted, the reason kept, left for the next cycle. */
  markFailed(rows: ChangeRow[], error: string): Promise<void>
  saveHealth(rows: HealthRow[]): Promise<void>
  /** When the worker last started, from job_runs; null if it never has. */
  lastWorkerRunAt(): Promise<string | null>
  pruneProcessed(before: Date): Promise<void>
}

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

const CHANGE_COLUMNS = 'id, tenant_id, table_name, record_id, op, template_id, changed_fields, is_active, changed_at, attempts'

/** Supabase (service role) implementation. Every call checks its error: a
 *  read that silently came back empty would look like "nothing changed". */
export function supabaseSyncStore(db: Db): SyncStore {
  const check = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`)
  }
  return {
    async enrolled() {
      const { data, error } = await db.from('publish_sync_health').select('*, tenants(company_name)')
      check('reading Publish enrolment', error)
      return (data ?? []).map((r: HealthRow & { tenants?: { company_name: string | null } | null }) => {
        const { tenants, ...health } = r
        return { health: health as HealthRow, companyName: tenants?.company_name ?? null }
      })
    },
    async pending(limit) {
      const { data, error } = await db.from('publish_change_log')
        .select(CHANGE_COLUMNS).is('processed_at', null).order('id', { ascending: true }).limit(limit)
      check('reading the change log', error)
      return (data ?? []) as ChangeRow[]
    },
    async markProcessed(ids, note) {
      if (ids.length === 0) return
      const { error } = await db.from('publish_change_log')
        .update({ processed_at: new Date().toISOString(), error: note ?? null }).in('id', ids)
      check('marking changes processed', error)
    },
    async markFailed(rows, reason) {
      // attempts + 1, grouped by the current count (PostgREST cannot increment).
      const byAttempts = new Map<number, number[]>()
      for (const r of rows) byAttempts.set(r.attempts, [...(byAttempts.get(r.attempts) ?? []), r.id])
      for (const [attempts, ids] of byAttempts) {
        const { error } = await db.from('publish_change_log')
          .update({ attempts: attempts + 1, error: reason.slice(0, 500) }).in('id', ids)
        check('recording a failed delivery', error)
      }
    },
    async saveHealth(rows) {
      if (rows.length === 0) return
      const { error } = await db.from('publish_sync_health').upsert(rows, { onConflict: 'tenant_id' })
      check('saving Publish sync health', error)
    },
    async lastWorkerRunAt() {
      const { data, error } = await db.from('job_runs').select('started_at')
        .eq('job_name', 'publish-sync').order('started_at', { ascending: false }).limit(1).maybeSingle()
      check('reading the worker\'s last run', error)
      return (data?.started_at as string | undefined) ?? null
    },
    async pruneProcessed(before) {
      const { error } = await db.from('publish_change_log').delete()
        .not('processed_at', 'is', null).lt('processed_at', before.toISOString())
      check('pruning the change log', error)
    },
  }
}
