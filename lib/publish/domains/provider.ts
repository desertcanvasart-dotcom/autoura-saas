// ============================================
// Publish — connecting an agency's own domain (step 11, PLAN D13)
// ============================================
// One interface, so the provider can change without the agency seeing it
// (operator, 2026-10-28: "Railway now, Cloudflare later"). Railway allows 20
// custom domains per service on the Pro plan and will not raise it for
// multi-tenant platforms; Cloudflare for SaaS (custom hostnames) is the
// next provider, behind this same interface.
//
// What a provider does: register a hostname for the site renderer, tell the
// agency which DNS records to add, and report how far along it is.

export type DomainStatus = 'pending_dns' | 'verifying' | 'active' | 'failed'

export interface DnsRecord {
  type: 'CNAME' | 'TXT' | 'A'
  /** The full name to set, e.g. "tours.agency.com" or "_railway-verify.tours.agency.com". */
  name: string
  value: string
  /** route: sends visitors to us · verify: proves the domain is theirs. */
  purpose: 'route' | 'verify'
  /** Seen in DNS as required. */
  ok: boolean
}

export interface DomainState {
  /** The provider's id for this domain (publish_domains.provider_ref). */
  ref: string
  status: DomainStatus
  records: DnsRecord[]
  /** Why it failed, in words an agency can act on. */
  error: string | null
}

export interface DomainProvider {
  readonly name: string
  add(hostname: string): Promise<DomainState>
  check(ref: string, hostname: string): Promise<DomainState>
  remove(ref: string): Promise<void>
}

export class DomainProviderError extends Error {}
