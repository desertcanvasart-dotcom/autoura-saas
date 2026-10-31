// ============================================
// Publish — hostnames (pure rules)
// ============================================
// No database, no pricing: the site renderer (sites/) imports these on every
// request (sites/proxy.ts), so they live apart from site-data.ts and the
// tour-facts / pricing-engine chain it pulls in.

/** The hostname as stored in publish_domains: lower case, no port, no trailing dot. */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  return /^[a-z0-9.-]+$/.test(h) && h.includes('.') ? h : null
}

/**
 * Whether a hostname serves its site. A test hostname always does (it is
 * how a site is seen before launch, and how our own brands run first); a
 * real one only once its domain is verified and the site is live. A
 * suspended site is served nowhere.
 */
export function domainServes(kind: string, domainStatus: string, siteStatus: string): boolean {
  if (siteStatus === 'suspended') return false
  if (kind === 'test') return true
  return domainStatus === 'active' && siteStatus === 'live'
}
