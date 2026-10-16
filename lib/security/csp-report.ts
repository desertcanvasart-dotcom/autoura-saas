// The useful part of a CSP violation report, and a throttle so a page that
// violates on every load logs once rather than thousands of times.

export interface CspViolation {
  directive: string
  blocked: string
  page: string
}

/** Origin only, so no query string (tokens, ids) is ever logged. */
function originOnly(url: unknown): string {
  if (typeof url !== 'string' || !url) return ''
  if (!/^[a-z]+:\/\//i.test(url)) return url.slice(0, 40) // 'inline', 'eval', 'data'
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function pathOnly(url: unknown): string {
  try {
    return typeof url === 'string' ? new URL(url).pathname.slice(0, 200) : ''
  } catch {
    return ''
  }
}

/** Accepts both the legacy {"csp-report": {...}} body and Reporting API arrays. */
export function summariseCspReport(body: unknown): CspViolation | null {
  const r = (Array.isArray(body) ? (body[0] as { body?: unknown })?.body : (body as Record<string, unknown> | null)?.['csp-report']) as
    | Record<string, unknown>
    | undefined
  if (!r || typeof r !== 'object') return null
  const directive = String(r['effective-directive'] ?? r['effectiveDirective'] ?? r['violated-directive'] ?? '').slice(0, 60)
  if (!directive) return null
  return {
    directive,
    blocked: originOnly(r['blocked-uri'] ?? r['blockedURL']),
    page: pathOnly(r['document-uri'] ?? r['documentURL']),
  }
}

const seen = new Map<string, number>()
const WINDOW_MS = 60 * 60 * 1000

export function shouldLogCspViolation(v: CspViolation, now = Date.now()): boolean {
  const key = `${v.directive}|${v.blocked}`
  const prev = seen.get(key)
  if (prev !== undefined && now - prev < WINDOW_MS) return false
  seen.set(key, now)
  if (seen.size > 1000) seen.clear()
  return true
}
