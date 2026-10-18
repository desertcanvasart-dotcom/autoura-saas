// ============================================
// Schedule send — the rules, apart from Gmail and the database
// ============================================
// A scheduled email is a Gmail draft plus a time (migration 421). These are
// the decisions the routes and the job share, kept pure so they are tested.

/** Earliest a send may be scheduled: a minute out (sooner is just "Send"). */
export const MIN_LEAD_MS = 60_000
/** Latest: a year out — further is almost certainly a typo in the year. */
export const MAX_LEAD_MS = 366 * 86_400_000
/** A claim older than this means a job run died mid-send. */
export const STALE_CLAIM_MS = 15 * 60_000
/** A send that fails for a passing reason is tried this many times in all. */
export const MAX_ATTEMPTS = 3
/** Most due emails one job run sends. */
export const MAX_PER_RUN = 50

/** Why `sendAt` cannot be used, or null when it can. */
export function scheduleTimeProblem(sendAt: unknown, now: Date = new Date()): string | null {
  const t = typeof sendAt === 'string' || typeof sendAt === 'number' ? new Date(sendAt) : null
  if (!t || isNaN(t.getTime())) return 'Choose a date and time'
  const lead = t.getTime() - now.getTime()
  if (lead < MIN_LEAD_MS) return 'Choose a time at least a minute from now'
  if (lead > MAX_LEAD_MS) return 'Choose a time within the next year'
  return null
}

/** Gmail errors worth another try next run: rate limits and Gmail's own faults. */
export function isTransientGmailError(err: unknown): boolean {
  const o = err as { code?: number; status?: number; response?: { status?: number } }
  const status = o?.response?.status ?? o?.status ?? o?.code
  return status === 429 || (typeof status === 'number' && status >= 500)
}

export type SendOutcome =
  | { status: 'sent'; gmailMessageId: string | null }
  | { status: 'pending'; error: string }
  | { status: 'failed'; error: string }

/** What a failed send attempt becomes. `attempts` includes this one. */
export function outcomeOfError(err: unknown, attempts: number): SendOutcome {
  const o = err as { code?: number; message?: string }
  if (o?.code === 404) {
    return { status: 'failed', error: 'The draft was deleted or already sent, so there was nothing to send.' }
  }
  const message = o?.message || 'Gmail did not accept the email'
  if (isTransientGmailError(err) && attempts < MAX_ATTEMPTS) return { status: 'pending', error: message }
  return { status: 'failed', error: message }
}

/** How long Send waits, with an Undo, before the email really goes. */
export const UNDO_SEND_MS = 5_000

/** The composer's quick choices, in the person's own time zone. */
export function schedulePresets(now: Date = new Date()): Array<{ label: string; at: Date }> {
  const at = (daysAhead: number, hour: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + daysAhead)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const daysToMonday = ((8 - now.getDay()) % 7) || 7
  const presets = [
    { label: 'Tomorrow morning', at: at(1, 8) },
    { label: 'Tomorrow afternoon', at: at(1, 13) },
    { label: 'Monday morning', at: at(daysToMonday, 8) },
  ]
  // On a Sunday, "Monday morning" is "tomorrow morning": show it once.
  return presets.filter((p, i) => presets.findIndex(q => q.at.getTime() === p.at.getTime()) === i)
}

/** A Date as the value of an <input type="datetime-local"> (local time). */
export function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
