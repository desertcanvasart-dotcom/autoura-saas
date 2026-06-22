// ============================================
// CONCIERGE SLA — response-deadline indicator (pure)
// ============================================
// The AI concierge commits a `committed_response_by` deadline to the visitor.
// This derives a triage urgency level from that deadline + the review_status.

export type SlaLevel = 'none' | 'ok' | 'soon' | 'overdue' | 'met'

export interface SlaInfo {
  level: SlaLevel
  label: string
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

/**
 * Derive the SLA indicator. `nowMs` is injectable for tests.
 *  - responded  -> 'met'      (the commitment was honoured)
 *  - archived   -> 'none'     (no longer pressing)
 *  - no deadline-> 'none'
 *  - past due   -> 'overdue'
 *  - <=2h left  -> 'soon'
 *  - otherwise  -> 'ok'
 */
export function conciergeSla(
  committedResponseBy: string | null | undefined,
  reviewStatus: string,
  nowMs?: number
): SlaInfo {
  if (reviewStatus === 'responded') return { level: 'met', label: 'Responded' }
  if (reviewStatus === 'archived') return { level: 'none', label: 'Archived' }
  if (!committedResponseBy) return { level: 'none', label: 'No SLA' }

  const due = new Date(committedResponseBy).getTime()
  if (Number.isNaN(due)) return { level: 'none', label: 'No SLA' }

  const now = nowMs ?? Date.now()
  const diffMin = Math.round((due - now) / 60000)

  if (diffMin < 0) return { level: 'overdue', label: `Overdue ${fmtDuration(-diffMin)}` }
  return { level: diffMin <= 120 ? 'soon' : 'ok', label: `Due in ${fmtDuration(diffMin)}` }
}
