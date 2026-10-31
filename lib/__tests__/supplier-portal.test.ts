import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildPortalLinkMessage, portalSections, toPortalLine, type PortalSourceLine } from '@/lib/supplier-portal'

const src = (over: Partial<PortalSourceLine>): PortalSourceLine => ({
  id: Math.random().toString(36).slice(2), booking_id: 'b1', status: 'requested', supplier_type: 'transport',
  service_description: 'Airport pickup', service_date: '2026-11-10', service_time: '09:30:00', pickup_location: 'Cairo Airport',
  dropoff_location: null, pax: 2, reply_deadline: null, assigned_vehicle_plate: null, assigned_guide_name: null,
  assigned_guide_phone: null, driver_note: null, resource_kind: 'supplier', ...over,
})
const TODAY = '2026-11-05'
const sections = (rows: PortalSourceLine[]) => portalSections(rows.map(r => toPortalLine(r, 'Tersa')), TODAY)

describe("the supplier's own page", () => {
  it('waiting requests to answer; covered jobs upcoming; done (or covered and past) under Done', () => {
    const s = sections([
      src({ status: 'requested' }),
      src({ status: 'accepted', service_date: '2026-11-07' }),
      src({ status: 'assigned', service_date: '2026-11-06', assigned_vehicle_plate: 'ABC 1' }),
      src({ status: 'assigned', service_date: '2026-11-01' }),
      src({ status: 'done', service_date: '2026-10-20' }),
    ])
    expect(s.requests).toHaveLength(1)
    expect(s.upcoming.map(l => l.date)).toEqual(['2026-11-06', '2026-11-07'])
    expect(s.done.map(l => l.date)).toEqual(['2026-11-01', '2026-10-20'])
  })

  it('never shows To arrange, Declined, No reply, Not needed, or old done jobs; a request for a past day is gone', () => {
    const s = sections([
      src({ status: 'pending' }), src({ status: 'declined' }), src({ status: 'expired' }), src({ status: 'cancelled' }),
      src({ status: 'done', service_date: '2026-08-01' }), src({ status: 'requested', service_date: '2026-11-01' }),
    ])
    expect([s.requests.length, s.upcoming.length, s.done.length]).toEqual([0, 0, 0])
  })

  it('shows the service, not the price or the client contacts — only the lead name', () => {
    const l = toPortalLine({ ...src({}), quoted_cost: 100, client_phone: '+1' } as PortalSourceLine, 'Tersa')
    expect(Object.keys(l)).not.toContain('quoted_cost')
    expect(JSON.stringify(l)).not.toContain('+1')
    expect(l).toMatchObject({ service: 'Airport pickup', time: '09:30', guests: 2, clientName: 'Tersa', assign: 'car' })
  })

  it('the WhatsApp text says it is their standing page, no login, and carries the link', () => {
    const m = buildPortalLinkMessage({ supplierName: 'Ahmed Cars', agency: 'Travel2Egypt', url: 'https://x/supplier/t' })
    expect(m.startsWith('Hello Ahmed,')).toBe(true)
    expect(m).toContain('bookings from Travel2Egypt')
    expect(m).toContain('no login')
    expect(m.endsWith('https://x/supplier/t')).toBe(true)
  })
})

describe('what the page and its link can touch', () => {
  it('a tap reaches only a line of THAT supplier at THAT agency, never one the agency covers itself', () => {
    const route = readFileSync('app/api/supplier-page/[token]/lines/[lineId]/route.ts', 'utf8')
    expect(route).toContain(".eq('tenant_id', link.tenant_id)")
    expect(route).toContain(".eq('supplier_id', link.supplier_id)")
    expect(route).toContain("line.resource_kind === 'own'")
    expect(route).toContain(".is('revoked_at', null)")
    expect(route).toContain('applySupplierAnswer(')
  })

  it('the page lists only that supplier at that agency and 404s a switched-off link', () => {
    const page = readFileSync('app/supplier/[token]/page.tsx', 'utf8')
    expect(page).toContain('loadSupplierAgency(db, link.tenant_id, link.supplier_id')
    expect(readFileSync('lib/supplier-page-data.ts', 'utf8')).toContain(".eq('tenant_id', tenantId).eq('supplier_id', supplierId)")
    expect(page).toContain(".is('revoked_at', null)")
    expect(page).toContain('notFound()')
  })

  it('the office makes, sends and switches off links — managers only, its own suppliers', () => {
    const office = readFileSync('app/api/suppliers/[id]/portal-link/route.ts', 'utf8')
    expect(office.match(/roleDenied\(auth\.role, 'manage'\)/g)?.length).toBe(3)
    expect(office).toContain(".eq('id', id).eq('tenant_id', tenant_id)")
  })

  it('middleware opens the page and its endpoint to suppliers with no login, and nothing wider', () => {
    const mw = readFileSync('middleware.ts', 'utf8')
    expect(mw).toContain("'/api/supplier-page/',")
    expect(mw).toContain("    '/supplier',\n")
  })
})

describe('the request and the supplier page work together', () => {
  it('a request mentions their own page when they have one, after the reply link', async () => {
    const { buildServiceRequestMessage } = await import('@/lib/supplier-reply-link')
    const base = { service: 'Airport pickup', replyHours: 4, assign: 'car' as const, url: 'https://x/reply/r' }
    expect(buildServiceRequestMessage(base)).not.toContain('All your bookings')
    const m = buildServiceRequestMessage({ ...base, pageUrl: 'https://x/supplier/p' })
    expect(m.endsWith('All your bookings with us: https://x/supplier/p')).toBe(true)
    expect(m.indexOf('https://x/reply/r')).toBeLessThan(m.indexOf('https://x/supplier/p'))
  })

  it('the request route looks up only that supplier’s active page at this agency', () => {
    const route = readFileSync('app/api/bookings/[id]/suppliers/[lineId]/request/route.ts', 'utf8')
    expect(route).toContain(".from('supplier_portal_links').select('token').eq('tenant_id', tenant_id).eq('supplier_id', line.supplier_id).is('revoked_at', null)")
  })

  it('a waiting line says whether the supplier has seen it', () => {
    expect(readFileSync('app/api/bookings/[id]/suppliers/route.ts', 'utf8')).toContain('seen: seenAt(')
    expect(readFileSync('components/booking/BookingSuppliersPanel.tsx', 'utf8')).toContain("'not opened yet'")
  })
})
