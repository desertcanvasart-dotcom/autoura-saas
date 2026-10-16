// Which scheduled jobs need someone to look, for /api/health/deep?strict=1.
import { staleAfterHours } from '@/lib/support/bundle'

/** Jobs that ran but have since stopped, or whose last run failed or never finished. */
export function jobsNeedAttention(
  crons: Array<{ name: string; lastRun: string | null; lastOutcome?: string | null }>,
  now: number = Date.now(),
): string[] {
  return crons
    .filter(c => {
      if (!c.lastRun) return false // never run: a setup gap, reported in findings
      const age = now - Date.parse(c.lastRun)
      return age > staleAfterHours(c.name) * 3600000 || c.lastOutcome === 'failed' || c.lastOutcome === 'unfinished'
    })
    .map(c => c.name)
}
