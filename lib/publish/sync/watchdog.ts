// ============================================
// Publish sync — noticing that the worker itself stopped
// ============================================
// A dead worker cannot report that it is dead; that is exactly how the Sawa
// mirror failed unseen. So the check runs somewhere else: after every OTHER
// scheduled job (lib/support/job-runs.ts withJobRun — mail alerts and
// scheduled send run every 5 minutes too). If publish-sync has not started for STALL_AFTER_SECONDS, every enrolled
// company is marked stalled and alerted once. The worker's next run clears it
// and announces recovery (health.ts).

import { markStalled, workerStalled, type HealthRow } from './health'
import type { Alerter } from './worker'
import type { SyncStore } from './store'

export async function watchPublishWorker(deps: {
  store: SyncStore
  alert: Alerter
  now?: () => Date
}): Promise<{ stalled: boolean; alerts: number }> {
  const now = (deps.now ?? (() => new Date()))()
  const companies = await deps.store.enrolled()
  if (companies.length === 0) return { stalled: false, alerts: 0 }

  const lastRunAt = await deps.store.lastWorkerRunAt()
  const earliest = companies.map(c => c.health.enrolled_at).sort()[0]
  if (!workerStalled(lastRunAt, earliest, now)) return { stalled: false, alerts: 0 }

  const changed: HealthRow[] = []
  let alerts = 0
  for (const c of companies) {
    const decision = markStalled(c.health, lastRunAt, now)
    changed.push(decision.next)
    if (decision.alert) {
      alerts++
      await deps.alert({
        tenantId: c.health.tenant_id,
        companyName: c.companyName,
        kind: 'problem',
        status: 'stalled',
        detail: decision.next.last_error,
      }).catch(e => console.error('[publish-sync] stall alert failed:', e instanceof Error ? e.message : e))
    }
  }
  await deps.store.saveHealth(changed)
  return { stalled: true, alerts }
}
