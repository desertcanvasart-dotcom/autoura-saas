// ============================================
// The agency's clock, for pages people outside it read
// ============================================
// Server-rendered supplier pages printed deadlines in the server's clock
// (UTC): a supplier in Cairo read "answer by 20:03" while the office saw
// 22:03 (2026-10-30 end-to-end test). Every tenant's `timezone` was still the
// column default 'UTC', so a set timezone wins only when it is not that
// default; otherwise the agency's country decides; otherwise UTC, labelled.

const COUNTRY_TZ: Record<string, string> = {
  egypt: 'Africa/Cairo', morocco: 'Africa/Casablanca', jordan: 'Asia/Amman', tunisia: 'Africa/Tunis',
  turkey: 'Europe/Istanbul', türkiye: 'Europe/Istanbul', greece: 'Europe/Athens',
  'united arab emirates': 'Asia/Dubai', uae: 'Asia/Dubai', japan: 'Asia/Tokyo', italy: 'Europe/Rome',
  spain: 'Europe/Madrid', france: 'Europe/Paris', portugal: 'Europe/Lisbon', 'united kingdom': 'Europe/London', uk: 'Europe/London',
}

function isZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true } catch { return false }
}

/** The agency's IANA time zone, or 'UTC' when nothing says otherwise. */
export function agencyTimeZone(timezone: string | null | undefined, operatingCountry: string | null | undefined): string {
  const set = (timezone ?? '').trim()
  if (set && set.toUpperCase() !== 'UTC' && isZone(set)) return set
  return COUNTRY_TZ[(operatingCountry ?? '').trim().toLowerCase()] ?? 'UTC'
}

/** "30 Oct, 22:03" in the agency's clock ("30 Oct, 20:03 UTC" when it has none). */
export function agencyDateTime(iso: string, timeZone: string): string {
  const s = new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone })
  return timeZone === 'UTC' ? `${s} UTC` : s
}
