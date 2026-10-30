// ============================================
// Railway as the domain provider (custom domains on the publish-sites service)
// ============================================
// Railway's public GraphQL API (schema read 2026-10-28): customDomainCreate
// registers the hostname on the service; its status carries the DNS records
// (dnsRecords: purpose TRAFFIC_ROUTE / ACME_DNS01_CHALLENGE, type, required
// and current value, PROPAGATED or REQUIRES_UPDATE), the ownership TXT
// (verificationDnsHost + verificationToken, verified) and the certificate
// (certificateStatus … VALID / ISSUE_FAILED).
//
// Env (web service): RAILWAY_API_TOKEN, and the publish-sites service's
// RAILWAY_PUBLISH_PROJECT_ID / RAILWAY_PUBLISH_ENVIRONMENT_ID /
// RAILWAY_PUBLISH_SERVICE_ID. Limit: 20 custom domains per service (Pro).

import { DomainProviderError, type DnsRecord, type DomainProvider, type DomainState } from './provider'

const API = 'https://backboard.railway.com/graphql/v2'

const STATUS_FIELDS = `
  id domain
  status {
    verified verificationDnsHost verificationToken
    certificateStatus certificateErrorMessage
    dnsRecords { hostlabel fqdn zone recordType purpose requiredValue currentValue status }
  }`

export interface RailwayConfig { token: string; projectId: string; environmentId: string; serviceId: string }

export function railwayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RailwayConfig | null {
  const { RAILWAY_API_TOKEN, RAILWAY_PUBLISH_PROJECT_ID, RAILWAY_PUBLISH_ENVIRONMENT_ID, RAILWAY_PUBLISH_SERVICE_ID } = env
  if (!RAILWAY_API_TOKEN || !RAILWAY_PUBLISH_PROJECT_ID || !RAILWAY_PUBLISH_ENVIRONMENT_ID || !RAILWAY_PUBLISH_SERVICE_ID) return null
  return { token: RAILWAY_API_TOKEN, projectId: RAILWAY_PUBLISH_PROJECT_ID, environmentId: RAILWAY_PUBLISH_ENVIRONMENT_ID, serviceId: RAILWAY_PUBLISH_SERVICE_ID }
}

interface RawDomain {
  id: string
  domain: string
  status: {
    verified: boolean | null
    verificationDnsHost: string | null
    verificationToken: string | null
    certificateStatus: string | null
    certificateErrorMessage: string | null
    dnsRecords: Array<{ hostlabel: string | null; fqdn: string | null; zone: string | null; recordType: string; purpose: string; requiredValue: string; currentValue: string | null; status: string }> | null
  } | null
}

const TYPE: Record<string, DnsRecord['type'] | undefined> = { DNS_RECORD_TYPE_CNAME: 'CNAME', DNS_RECORD_TYPE_TXT: 'TXT', DNS_RECORD_TYPE_A: 'A' }

/** Railway's answer as the provider-neutral state. Pure — tested on its own. */
export function stateOf(d: RawDomain): DomainState {
  const st = d.status
  const records: DnsRecord[] = []
  for (const r of st?.dnsRecords ?? []) {
    const type = TYPE[r.recordType]
    if (!type) continue
    records.push({
      type,
      name: r.fqdn || [r.hostlabel, r.zone].filter(Boolean).join('.') || d.domain,
      value: r.requiredValue,
      purpose: r.purpose === 'DNS_RECORD_PURPOSE_TRAFFIC_ROUTE' ? 'route' : 'verify',
      ok: r.status === 'DNS_RECORD_STATUS_PROPAGATED',
    })
  }
  // The ownership TXT is not always among dnsRecords; it is always here.
  if (st?.verificationDnsHost && st.verificationToken && !records.some(r => r.type === 'TXT' && r.value === st.verificationToken)) {
    // Railway gives the host relative to the domain's zone ("_railway-verify.tours"
    // in zone "agency.com"); complete it unless it is already a full name.
    const zone = st.dnsRecords?.find(r => r.zone)?.zone ?? d.domain.split('.').slice(-2).join('.')
    const vh = st.verificationDnsHost.replace(/\.$/, '')
    const host = vh.endsWith(`.${zone}`) || vh === zone ? vh : `${vh}.${zone}`
    records.push({ type: 'TXT', name: host, value: st.verificationToken, purpose: 'verify', ok: st.verified === true })
  }

  const cert = st?.certificateStatus ?? ''
  let status: DomainState['status']
  let error: string | null = null
  if (cert === 'CERTIFICATE_STATUS_TYPE_ISSUE_FAILED') {
    status = 'failed'
    error = st?.certificateErrorMessage || 'The security certificate could not be issued. Check the DNS records, then check again.'
  } else if (cert === 'CERTIFICATE_STATUS_TYPE_VALID' && records.filter(r => r.purpose === 'route').every(r => r.ok)) {
    status = 'active'
  } else if (records.length > 0 && records.filter(r => r.purpose === 'route').every(r => r.ok)) {
    status = 'verifying'
  } else {
    status = 'pending_dns'
  }
  return { ref: d.id, status, records, error }
}

export function railwayProvider(config: RailwayConfig, fetchImpl: typeof fetch = fetch): DomainProvider {
  async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    })
    const json = await res.json().catch(() => null) as { data?: T; errors?: Array<{ message: string }> } | null
    if (!res.ok || !json || json.errors?.length || !json.data) {
      const message = json?.errors?.map(e => e.message).join('; ') || `HTTP ${res.status}`
      throw new DomainProviderError(/limit/i.test(message)
        ? 'The domain limit on our hosting is reached — contact Autoura to connect more domains.'
        : `The hosting provider refused: ${message}`)
    }
    return json.data
  }
  return {
    name: 'railway',
    async add(hostname) {
      const data = await gql<{ customDomainCreate: RawDomain }>(
        `mutation($input: CustomDomainCreateInput!) { customDomainCreate(input: $input) { ${STATUS_FIELDS} } }`,
        { input: { domain: hostname, projectId: config.projectId, environmentId: config.environmentId, serviceId: config.serviceId } },
      )
      return stateOf(data.customDomainCreate)
    },
    async check(ref) {
      const data = await gql<{ customDomain: RawDomain | null }>(
        `query($id: String!, $projectId: String!) { customDomain(id: $id, projectId: $projectId) { ${STATUS_FIELDS} } }`,
        { id: ref, projectId: config.projectId },
      )
      if (!data.customDomain) throw new DomainProviderError('The hosting provider no longer has this domain — remove it and add it again.')
      return stateOf(data.customDomain)
    },
    async remove(ref) {
      await gql<{ customDomainDelete: boolean }>(`mutation($id: String!) { customDomainDelete(id: $id) }`, { id: ref })
    },
  }
}
