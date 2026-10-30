// ============================================
// Publish sync — one worker cycle
// ============================================
// Run by /api/cron/publish-sync every 5 minutes:
//   1. read the waiting changes (publish_change_log, oldest first)
//   2. turn each into an event and its page tags (events.ts — the only
//      dispatch path); a shared row (no company) fans out to every enrolled
//      company
//   3. send each company's tags to the renderer once; only a confirmed
//      refresh marks its changes processed — a failed one stays waiting and
//      is retried next cycle
//   4. update every enrolled company's health, and alert on a change of state
//
// A change whose payload is invalid is a broken contract between the database
// and this code, not a transient fault: it is set aside with the reason (never
// retried forever) and the company's health records the failure.

import { dispatchChange, type ChangeRow } from './events'
import { nextHealth, LAG_LIMIT_SECONDS, type HealthRow, type AlertKind, type SyncStatus } from './health'
import type { Revalidator } from './revalidate'
import type { SyncStore, EnrolledCompany } from './store'

export const BATCH_SIZE = 500
export const KEEP_PROCESSED_DAYS = 7

export interface SyncAlert {
  tenantId: string
  companyName: string | null
  kind: AlertKind
  status: SyncStatus
  detail: string | null
}
export type Alerter = (alert: SyncAlert) => Promise<void>

export interface CycleReport {
  success: boolean
  companies: number
  changes: number
  refreshed: number
  failed: number
  setAside: number
  alerts: number
  summary: string
  results: Array<{ tenantId: string; status: SyncStatus; tags: number; error: string | null }>
}

export async function runSyncCycle(deps: {
  store: SyncStore
  revalidate: Revalidator
  alert: Alerter
  now?: () => Date
  batchSize?: number
}): Promise<CycleReport> {
  const now = deps.now ?? (() => new Date())
  const { store } = deps
  const companies = await store.enrolled()
  const byTenant = new Map<string, EnrolledCompany>(companies.map(c => [c.health.tenant_id, c]))
  const pending = await store.pending(deps.batchSize ?? BATCH_SIZE)

  // Per company: the tags to send, the rows they settle, the newest change.
  const work = new Map<string, { tags: Set<string>; rows: Set<number>; lastEventAt: string | null; error: string | null }>()
  const forTenant = (id: string) => {
    let w = work.get(id)
    if (!w) work.set(id, (w = { tags: new Set(), rows: new Set(), lastEventAt: null, error: null }))
    return w
  }
  const noTarget: number[] = []
  const setAside: Array<{ row: ChangeRow; error: string }> = []

  for (const row of pending) {
    const targets = row.tenant_id ? (byTenant.has(row.tenant_id) ? [row.tenant_id] : []) : [...byTenant.keys()]
    // Logged while the company was enrolled, which it no longer is.
    if (targets.length === 0) { noTarget.push(row.id); continue }
    for (const tenantId of targets) {
      const w = forTenant(tenantId)
      const result = dispatchChange(row, tenantId)
      if (!result.ok) {
        setAside.push({ row, error: result.error })
        w.error ??= `a change could not be read — ${result.error}`
        break // the row is set aside once, however many companies it fanned out to
      }
      for (const t of result.tags) w.tags.add(t)
      w.rows.add(row.id)
      if (!w.lastEventAt || row.changed_at > w.lastEventAt) w.lastEventAt = row.changed_at
    }
  }
  const setAsideIds = new Set(setAside.map(s => s.row.id))

  // Deliver. A shared row is settled only when every company it reached was
  // refreshed.
  const failedRows = new Map<number, string>()
  const delivered = new Set<number>()
  let refreshed = 0
  for (const [tenantId, w] of work) {
    const rows = [...w.rows].filter(id => !setAsideIds.has(id))
    if (w.tags.size === 0) { rows.forEach(id => delivered.add(id)); continue } // nothing shown changed
    try {
      await deps.revalidate(tenantId, [...w.tags])
      refreshed++
      rows.forEach(id => delivered.add(id))
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      w.error = w.error ? `${w.error}; ${reason}` : reason
      rows.forEach(id => failedRows.set(id, reason))
    }
  }
  const settled = [...delivered].filter(id => !failedRows.has(id))

  const rowById = new Map(pending.map(r => [r.id, r]))
  await store.markProcessed([...settled, ...noTarget])
  for (const { row, error } of setAside) await store.markProcessed([row.id], error)
  if (failedRows.size) {
    const byReason = new Map<string, ChangeRow[]>()
    for (const [id, reason] of failedRows) byReason.set(reason, [...(byReason.get(reason) ?? []), rowById.get(id)!])
    for (const [reason, rows] of byReason) await store.markFailed(rows, reason)
  }

  // Lag: the oldest change still waiting, per company (shared rows count for all).
  const settledSet = new Set([...settled, ...noTarget, ...setAsideIds])
  const oldestWaiting = new Map<string, number>()
  const nowMs = now().getTime()
  for (const row of pending) {
    if (settledSet.has(row.id)) continue
    const age = (nowMs - Date.parse(row.changed_at)) / 1000
    for (const t of row.tenant_id ? [row.tenant_id] : [...byTenant.keys()]) {
      oldestWaiting.set(t, Math.max(oldestWaiting.get(t) ?? 0, age))
    }
  }
  // A full batch may leave older-than-the-limit changes unread behind it.
  if (pending.length >= (deps.batchSize ?? BATCH_SIZE) && pending.length > 0) {
    const age = (nowMs - Date.parse(pending[pending.length - 1].changed_at)) / 1000
    if (age > LAG_LIMIT_SECONDS) for (const t of byTenant.keys()) oldestWaiting.set(t, Math.max(oldestWaiting.get(t) ?? 0, age))
  }

  // Health and alerts, for every enrolled company — including the quiet ones,
  // whose "in sync as of" moves on and whose stalled flag clears.
  const healthRows: HealthRow[] = []
  const results: CycleReport['results'] = []
  let alerts = 0
  for (const company of companies) {
    const tenantId = company.health.tenant_id
    const w = work.get(tenantId)
    const decision = nextHealth(company.health, {
      error: w?.error ?? null,
      lagSeconds: oldestWaiting.get(tenantId) ?? 0,
      lastEventAt: w?.lastEventAt ?? null,
    }, now())
    healthRows.push(decision.next)
    results.push({ tenantId, status: decision.next.status, tags: w?.tags.size ?? 0, error: w?.error ?? null })
    if (decision.alert) {
      alerts++
      try {
        await deps.alert({ tenantId, companyName: company.companyName, kind: decision.alert.kind, status: decision.alert.status, detail: decision.next.last_error })
      } catch (e) {
        // The health row still records the state; an alert channel being down
        // must not lose it.
        console.error('[publish-sync] alert failed:', e instanceof Error ? e.message : e)
      }
    }
  }
  await store.saveHealth(healthRows)
  await store.pruneProcessed(new Date(nowMs - KEEP_PROCESSED_DAYS * 86400_000))

  const failing = results.filter(r => r.status === 'failing')
  return {
    success: failing.length === 0 && setAside.length === 0,
    companies: companies.length,
    changes: pending.length,
    refreshed,
    failed: failing.length,
    setAside: setAside.length,
    alerts,
    summary: `${pending.length} changes, ${refreshed} companies refreshed, ${failing.length} failing, ${setAside.length} set aside`,
    results,
  }
}
