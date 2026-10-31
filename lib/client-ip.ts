// ============================================
// The client's IP address, as the platform's edge saw it
// ============================================
// Pure (headers in, address out) so both the app (lib/rate-limit.ts) and the
// website renderer (sites/lib/lead-capture.ts) read it the same way.
//
// X-Forwarded-For is client-controllable: a client can PREPEND arbitrary
// entries, and each proxy APPENDS the address it saw. So the trustworthy
// client IP is not the leftmost entry (trivially spoofed to rotate
// identifiers and bypass a limit) but the one the outermost trusted proxy
// appended: the Nth entry from the right, where N = number of trusted proxy
// hops (TRUSTED_PROXY_COUNT, default 1 for a single edge like Railway's).
// X-Real-IP is only a fallback, for a request with no forwarded-for at all.
// Values that don't parse as an IP are rejected so a garbage header can't
// mint unlimited identifiers.

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV6_RE = /^[0-9a-fA-F:]+$/

function isValidIp(value: string): boolean {
  if (IPV4_RE.test(value)) {
    return value.split('.').every(o => Number(o) <= 255)
  }
  return value.includes(':') && IPV6_RE.test(value)
}

type HeaderReader = { get(name: string): string | null }

/** The client's address, or null when no trustworthy one is present. */
export function clientIpFromHeaders(headers: HeaderReader): string | null {
  const hops = Math.max(1, parseInt(process.env.TRUSTED_PROXY_COUNT || '1', 10) || 1)

  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const parts = forwardedFor.split(',').map(p => p.trim()).filter(Boolean)
    // The address the outermost trusted proxy observed.
    const candidate = parts[parts.length - hops]
    if (candidate && isValidIp(candidate)) {
      return candidate
    }
  }

  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp && isValidIp(realIp)) {
    return realIp
  }
  return null
}
