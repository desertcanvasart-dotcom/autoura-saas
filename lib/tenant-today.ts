// ============================================
// "Today" for a company, on the server
// ============================================
// The server clock is UTC, so `new Date().toISOString().slice(0, 10)` is
// yesterday in Tokyo until 09:00 and in Cairo until 02:00 or 03:00: due
// dates set a day early, task reminders a day behind, "{{today}}" in an email
// showing yesterday (documents audit, round 12). The company's own timezone
// is tenants.timezone (Settings → Organization); unset, it is UTC — the old
// behaviour — and BUSINESS_TIMEZONE can set a platform-wide default.

import { todayInTimeZone } from '@/lib/today'

type Db = { from: (table: string) => unknown }
type TenantQuery = {
  select: (cols: string) => {
    eq: (c: string, v: string) => {
      maybeSingle: () => PromiseLike<{ data: { timezone?: string | null } | null; error: unknown }>
    }
  }
}

/** The zone a company's dates follow: its own, else the platform default, else UTC. */
export function resolveTimeZone(tenantTimeZone: string | null | undefined): string {
  const own = String(tenantTimeZone || '').trim()
  return own || process.env.BUSINESS_TIMEZONE || 'UTC'
}

/** The company's timezone, read from the tenant row. Never throws. */
export async function tenantTimeZone(db: Db, tenantId: string | null | undefined): Promise<string> {
  if (!tenantId) return resolveTimeZone(null)
  try {
    const { data } = await (db.from('tenants') as TenantQuery).select('timezone').eq('id', tenantId).maybeSingle()
    return resolveTimeZone(data?.timezone)
  } catch {
    return resolveTimeZone(null)
  }
}

/** Today (YYYY-MM-DD) in the company's timezone. */
export async function tenantToday(db: Db, tenantId: string | null | undefined, date: Date = new Date()): Promise<string> {
  return todayInTimeZone(await tenantTimeZone(db, tenantId), date)
}
