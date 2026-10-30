import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stateOf, railwayProvider } from '@/lib/publish/domains/railway'
import type { DomainProvider, DomainState } from '@/lib/publish/domains/provider'
import {
  addDomain, checkDomain, checkPendingDomains, claimFreeAddress, domainsOf, removeDomain, setMainDomain, setSiteLive,
  PublishError, type Actor, type AdminDeps,
} from '@/lib/publish/admin'

// ============================================================================
// An agency's own domain (step 11; operator 2026-10-28: Railway now,
// Cloudflare later, plus free addresses on our domain). What it proves:
//   · Railway's answer becomes waiting-for-DNS → verifying → ready (or failed)
//     with the exact records the agency must add;
//   · a domain serves only once ready; the main address is the one public
//     address, the others redirect to it; a site goes public only with a
//     ready main address;
//   · our own and the hosting's names can never be claimed; one domain, one site.
// ============================================================================

const T = 'tenant-a', SITE = 'site-a'
const actor: Actor = { tenantId: T, userId: 'u1', name: 'Mona Manager' }
type Row = Record<string, unknown>
let seq = 0

function makeDb(tables: Record<string, Row[]>) {
  return {
    tables,
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let op: { kind: 'select' } | { kind: 'insert'; row: Row } | { kind: 'update'; patch: Row } | { kind: 'delete' } = { kind: 'select' }
      let limit = Infinity
      const exec = () => {
        tables[table] ??= []
        if (op.kind === 'insert') {
          if (table === 'publish_domains' && tables[table].some(r => r.hostname === (op as { row: Row }).row.hostname)) return { data: null, error: { message: 'duplicate key' } }
          const row = { id: `${table}-${++seq}`, created_at: String(seq).padStart(4, '0'), ...op.row }
          tables[table].push(row)
          return { data: [row], error: null }
        }
        const hit = tables[table].filter(r => filters.every(f => f(r)))
        if (op.kind === 'update') { for (const h of hit) Object.assign(h, op.patch); return { data: hit, error: null } }
        if (op.kind === 'delete') { tables[table] = tables[table].filter(r => !hit.includes(r)); return { data: hit, error: null } }
        return { data: hit.slice(0, limit), error: null }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
        not: (c: string, _op: string, v: unknown) => { filters.push(r => (r[c] ?? null) !== v); return q },
        order: () => q,
        limit: (n: number) => { limit = n; return q },
        insert: (row: Row) => { op = { kind: 'insert', row }; return q },
        update: (patch: Row) => { op = { kind: 'update', patch }; return q },
        delete: () => { op = { kind: 'delete' }; return q },
        maybeSingle: async () => { const r = exec(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error } },
        single: async () => { const r = exec(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error } },
        then: (res: (v: unknown) => unknown) => res(exec()),
      }
      return q
    },
  }
}

// ---------- Railway's answer ----------

const raw = (over: { verified?: boolean; cert?: string; routeOk?: boolean; certError?: string } = {}) => ({
  id: 'cd_1', domain: 'tours.agency.com',
  status: {
    verified: over.verified ?? false, verificationDnsHost: '_railway-verify.tours', verificationToken: 'railway-verify=abc123',
    certificateStatus: over.cert ?? 'CERTIFICATE_STATUS_TYPE_UNSPECIFIED', certificateErrorMessage: over.certError ?? null,
    dnsRecords: [{ hostlabel: 'tours', fqdn: 'tours.agency.com', zone: 'agency.com', recordType: 'DNS_RECORD_TYPE_CNAME',
      purpose: 'DNS_RECORD_PURPOSE_TRAFFIC_ROUTE', requiredValue: 'abc.up.railway.app', currentValue: over.routeOk ? 'abc.up.railway.app' : null,
      status: over.routeOk ? 'DNS_RECORD_STATUS_PROPAGATED' : 'DNS_RECORD_STATUS_REQUIRES_UPDATE' }],
  },
})

describe('Railway\'s answer, in the agency\'s terms', () => {
  it('waiting for DNS: the route CNAME and the ownership TXT to add', () => {
    expect(stateOf(raw())).toEqual({
      ref: 'cd_1', status: 'pending_dns', error: null,
      records: [
        { type: 'CNAME', name: 'tours.agency.com', value: 'abc.up.railway.app', purpose: 'route', ok: false },
        { type: 'TXT', name: '_railway-verify.tours.agency.com', value: 'railway-verify=abc123', purpose: 'verify', ok: false },
      ],
    })
  })
  it('DNS seen, certificate on its way → verifying; certificate valid → ready', () => {
    expect(stateOf(raw({ routeOk: true, cert: 'CERTIFICATE_STATUS_TYPE_ISSUING' })).status).toBe('verifying')
    expect(stateOf(raw({ routeOk: true, verified: true, cert: 'CERTIFICATE_STATUS_TYPE_VALID' })).status).toBe('active')
  })
  it('a failed certificate is reported with the reason', () => {
    expect(stateOf(raw({ cert: 'CERTIFICATE_STATUS_TYPE_ISSUE_FAILED', certError: 'CAA record forbids' }))).toMatchObject({ status: 'failed', error: 'CAA record forbids' })
  })
  it('asks Railway to add the domain on the renderer service, and words its limit for the agency', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body))
      expect(body.variables.input).toEqual({ domain: 'tours.agency.com', projectId: 'p', environmentId: 'e', serviceId: 's' })
      expect((init!.headers as Record<string, string>).authorization).toBe('Bearer tok')
      return new Response(JSON.stringify({ data: { customDomainCreate: raw() } }))
    })
    const p = railwayProvider({ token: 'tok', projectId: 'p', environmentId: 'e', serviceId: 's' }, fetchImpl as never)
    expect((await p.add('tours.agency.com')).status).toBe('pending_dns')
    const limited = railwayProvider({ token: 'tok', projectId: 'p', environmentId: 'e', serviceId: 's' },
      (async () => new Response(JSON.stringify({ errors: [{ message: 'Custom domain limit reached' }] }))) as never)
    await expect(limited.add('x.agency.com')).rejects.toThrow(/limit on our hosting is reached/)
  })
})

// ---------- the workflow ----------

let db: ReturnType<typeof makeDb>
let states: Map<string, DomainState>
let deps: AdminDeps
const revalidate = vi.fn(async () => {})
const provider: DomainProvider = {
  name: 'fake',
  add: vi.fn(async (host: string) => { const s: DomainState = { ref: `ref-${host}`, status: 'pending_dns', records: [{ type: 'CNAME', name: host, value: 'x.up.railway.app', purpose: 'route', ok: false }], error: null }; states.set(s.ref, s); return s }),
  check: vi.fn(async (ref: string) => states.get(ref)!),
  remove: vi.fn(async () => {}),
}
const expectError = async (p: Promise<unknown>, status: number, message: RegExp) => {
  const e = await p.catch(x => x)
  expect(e).toBeInstanceOf(PublishError)
  expect((e as PublishError).status).toBe(status)
  expect((e as PublishError).message).toMatch(message)
}

beforeEach(() => {
  seq = 0
  states = new Map()
  revalidate.mockClear()
  db = makeDb({
    publish_sites: [{ id: SITE, tenant_id: T, archetype: 'modern', status: 'draft', languages: ['en'], brand: {}, settings: {}, tenants: { company_name: 'Sunrise' } }],
    publish_domains: [{ id: 'd-test', tenant_id: T, site_id: SITE, hostname: 'sunrise.up.railway.app', kind: 'test', status: 'active', provider_ref: null, created_at: '0000' }],
    tenants: [{ id: T, license_number: null, company_address: null, whatsapp_number: null }],
  })
  deps = { facts: vi.fn(), generate: vi.fn(), revalidate, now: () => new Date('2026-10-28T10:00:00Z'), domains: provider } as unknown as AdminDeps
  vi.stubEnv('PUBLISH_SITES_BASE_DOMAIN', 'autoura.site')
})
afterEach(() => vi.unstubAllEnvs())

describe('connecting the agency\'s own domain', () => {
  it('the first is the main address, the next ones redirect to it; the records to add come back', async () => {
    const first = await addDomain(db as never, actor, 'https://Tours.Agency.com/home', deps)
    expect(first).toMatchObject({ hostname: 'tours.agency.com', status: 'pending_dns', records: [{ type: 'CNAME', value: 'x.up.railway.app' }] })
    await addDomain(db as never, actor, 'www.tours.agency.com', deps)
    const rows = db.tables.publish_domains.filter(r => r.kind !== 'test')
    expect(rows.map(r => [r.hostname, r.kind, r.provider_ref])).toEqual([
      ['tours.agency.com', 'primary', 'ref-tours.agency.com'], ['www.tours.agency.com', 'alias_redirect', 'ref-www.tours.agency.com'],
    ])
  })
  it('our names, the hosting\'s and a domain already connected cannot be taken', async () => {
    await expectError(addDomain(db as never, actor, 'evil.getautoura.net', deps), 400, /belongs to Autoura/)
    await expectError(addDomain(db as never, actor, 'x.up.railway.app', deps), 400, /belongs to Autoura/)
    await expectError(addDomain(db as never, actor, 'sunrise.autoura.site', deps), 400, /belongs to Autoura/)
    await addDomain(db as never, actor, 'tours.agency.com', deps)
    await expectError(addDomain(db as never, actor, 'tours.agency.com', deps), 409, /already connected/)
    await expectError(addDomain(db as never, actor, 'not a domain', deps), 400, /Enter a domain/)
  })
  it('without a configured provider it says so plainly', async () => {
    await expectError(addDomain(db as never, actor, 'tours.agency.com', { ...deps, domains: null }), 503, /not switched on/)
  })
  it('checking moves it along; when ready the website is refreshed and the time recorded', async () => {
    const { id } = await addDomain(db as never, actor, 'tours.agency.com', deps)
    states.set('ref-tours.agency.com', { ref: 'ref-tours.agency.com', status: 'active', records: [], error: null })
    const r = await checkDomain(db as never, actor, id, deps)
    expect(r.status).toBe('active')
    expect(db.tables.publish_domains.find(d => d.id === id)).toMatchObject({ status: 'active', verified_at: '2026-10-28T10:00:00.000Z' })
    expect(revalidate).toHaveBeenCalled()
  })
  it('the sync job checks domains still waiting, and only those', async () => {
    await addDomain(db as never, actor, 'tours.agency.com', deps)
    states.set('ref-tours.agency.com', { ref: 'ref-tours.agency.com', status: 'active', records: [], error: null })
    expect(await checkPendingDomains(db as never, deps)).toEqual({ checked: 1, ready: 1 })
    expect(await checkPendingDomains(db as never, deps)).toEqual({ checked: 0, ready: 0 })
  })
  it('removing disconnects it at the provider too; a test address is ours to manage', async () => {
    const { id } = await addDomain(db as never, actor, 'tours.agency.com', deps)
    await removeDomain(db as never, actor, id, deps)
    expect(provider.remove).toHaveBeenCalledWith('ref-tours.agency.com')
    expect(db.tables.publish_domains.map(d => d.id)).toEqual(['d-test'])
    await expectError(removeDomain(db as never, actor, 'd-test', deps), 400, /managed by Autoura/)
  })
})

describe('a free address on our domain', () => {
  it('is ready at once; names are checked and reserved ones refused', async () => {
    const r = await claimFreeAddress(db as never, actor, 'Sunrise-Travel', deps)
    expect(r.hostname).toBe('sunrise-travel.autoura.site')
    expect(db.tables.publish_domains.find(d => d.hostname === 'sunrise-travel.autoura.site')).toMatchObject({ status: 'active', kind: 'primary' })
    expect((await domainsOf(db as never, actor, deps)).domains.find(d => d.hostname === 'sunrise-travel.autoura.site')!.connected).toBe(false)
    await expectError(claimFreeAddress(db as never, actor, 'sunrise-travel', deps), 409, /taken/)
    await expectError(claimFreeAddress(db as never, actor, 'www', deps), 400, /reserved/)
    await expectError(claimFreeAddress(db as never, actor, 'a', deps), 400, /3 to 40/)
  })
  it('is offered only when our base domain is set', async () => {
    vi.stubEnv('PUBLISH_SITES_BASE_DOMAIN', '')
    await expectError(claimFreeAddress(db as never, actor, 'sunrise', deps), 503, /not switched on/)
    expect((await domainsOf(db as never, actor, deps)).freeBase).toBeNull()
  })
})

describe('the main address and going public', () => {
  it('a ready domain can become the main one; the old main then redirects', async () => {
    await claimFreeAddress(db as never, actor, 'sunrise', deps)
    const { id } = await addDomain(db as never, actor, 'tours.agency.com', deps)
    await expectError(setMainDomain(db as never, actor, id, deps), 409, /Only a ready domain/)
    states.set('ref-tours.agency.com', { ref: 'ref-tours.agency.com', status: 'active', records: [], error: null })
    await checkDomain(db as never, actor, id, deps)
    await setMainDomain(db as never, actor, id, deps)
    const kinds = Object.fromEntries(db.tables.publish_domains.map(d => [d.hostname, d.kind]))
    expect(kinds).toMatchObject({ 'tours.agency.com': 'primary', 'sunrise.autoura.site': 'alias_redirect', 'sunrise.up.railway.app': 'test' })
  })
  it('a website goes public only with a ready main address, and can go back to draft', async () => {
    await expectError(setSiteLive(db as never, actor, true, deps), 409, /ready main address/)
    await claimFreeAddress(db as never, actor, 'sunrise', deps)
    // A ready address is not enough: the footer must say who the visitor deals with.
    await expectError(setSiteLive(db as never, actor, true, deps), 409, /registered company name.*ETAA licence number.*company address.*WhatsApp.*booking terms.*privacy notice/)
    Object.assign(db.tables.tenants[0], { license_number: 'ETAA 1234', company_address: '1 Nile St, Cairo', whatsapp_number: '+20 100 000 0000' })
    db.tables.publish_sites[0].settings = { legal: { entity: 'Sunrise Travel S.A.E.', termsUrl: 'https://sunrise.example/terms', privacyUrl: 'http://sunrise.example/privacy' } }
    // An http:// link is not a link the site will show — still missing.
    await expectError(setSiteLive(db as never, actor, true, deps), 409, /privacy notice/)
    ;(db.tables.publish_sites[0].settings as { legal: Record<string, string> }).legal.privacyUrl = 'https://sunrise.example/privacy'
    await setSiteLive(db as never, actor, true, deps)
    expect(db.tables.publish_sites[0].status).toBe('live')
    await setSiteLive(db as never, actor, false, deps)
    expect(db.tables.publish_sites[0].status).toBe('draft')
  })
})
