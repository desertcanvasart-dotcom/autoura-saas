// SSRF guard for URLs the SERVER fetches on a user's behalf.
//
// Two places take a caller-supplied `logoUrl` and fetch it server-side: the
// PDF route (Chromium loads it as <img>) and fetchLogoBytes (a direct fetch).
// Either could be pointed at an internal service or the cloud metadata
// endpoint (169.254.169.254) to read credentials. Scheme allow-listing is not
// enough — `http://169.254.169.254/…` is a valid https-or-http URL — so the
// host has to be resolved and every resolved address checked before any
// request is made.

import { lookup } from 'node:dns/promises'
import net from 'node:net'

/** Private, loopback, link-local, or otherwise non-public address? */
export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10) return true // 10/8
    if (a === 127) return true // loopback
    if (a === 0) return true // "this host"
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
    if (a === 192 && b === 168) return true // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 CGNAT
    return false
  }
  if (v === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true // loopback / unspecified
    if (lower.startsWith('fe80')) return true // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local fc00::/7
    // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return false
  }
  return true // unparseable → treat as unsafe
}

export interface UrlCheck {
  ok: boolean
  reason?: string
}

/**
 * Resolve `raw` and confirm it is an http(s) URL whose host resolves ONLY to
 * public addresses. Never throws. A DNS failure, a private address, or a bad
 * scheme all return { ok: false }.
 *
 * DNS is resolved here and the addresses are returned so a caller can pin the
 * connection to exactly what was checked (guarding against a rebind between
 * this check and the fetch). Callers that just gate a URL can ignore them.
 */
export async function checkPublicHttpUrl(
  raw: string | null | undefined
): Promise<UrlCheck & { addresses?: string[] }> {
  if (!raw) return { ok: false, reason: 'empty' }
  let url: URL
  try {
    url = new URL(String(raw).trim())
  } catch {
    return { ok: false, reason: 'not an absolute URL' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `scheme ${url.protocol} not allowed` }
  }
  // A literal IP host is checked directly; a name is resolved (all records).
  const hostname = url.hostname
  if (net.isIP(hostname)) {
    return isPrivateAddress(hostname)
      ? { ok: false, reason: `host ${hostname} is private` }
      : { ok: true, addresses: [hostname] }
  }
  let records: { address: string }[]
  try {
    records = await lookup(hostname, { all: true })
  } catch {
    return { ok: false, reason: `cannot resolve ${hostname}` }
  }
  if (records.length === 0) return { ok: false, reason: `no address for ${hostname}` }
  for (const r of records) {
    if (isPrivateAddress(r.address)) {
      return { ok: false, reason: `${hostname} resolves to private ${r.address}` }
    }
  }
  return { ok: true, addresses: records.map(r => r.address) }
}
