import { describe, it, expect } from 'vitest'
import { toStaffView, isValidStaffToken, generateStaffToken, resolveAssigneeContact, STAFF_EVENT_KINDS } from '@/lib/staff-link'

// The tap-link page is held by "anyone with the URL" — so the view is built
// the same way the customer share page is: from poisoned rows, asserting the
// poison never survives serialization.

const POISONED_TENANT = {
  id: 'TENANT-SECRET-ID', company_name: 'Sawa Tours',
  stripe_customer_id: 'cus_SECRET', contact_email: 'owner@secret.com',
}
const POISONED_ITINERARY = {
  id: 'ITIN-SECRET-ID', trip_name: 'A complete Egypt tour',
  start_date: '2026-09-01', end_date: '2026-09-11',
  total_cost: 4200, cost_base: 3100, margin_percent: 25,
  client_name: 'CUSTOMER-SECRET', client_phone: '+2010SECRET',
  internal_notes: 'INTERNAL-ITIN-NOTE',
}
const POISONED_RESOURCE = {
  id: 'RES-SECRET-ID', resource_name: 'Ahmed Hassan',
  start_date: '2026-09-02', end_date: '2026-09-05',
  cost_eur: 400, notes: 'INTERNAL-ASSIGNMENT-NOTE', status: 'confirmed',
}
const POISONED_EVENTS = [
  { event_kind: 'picked_up', occurred_at: '2026-09-02T09:15:00Z',
    note: 'INTERNAL-EVENT-NOTE', actor_name: 'office@secret.com', tenant_id: 'TENANT-SECRET-ID' },
  { event_kind: 'note', occurred_at: '2026-09-02T10:00:00Z', note: 'internal only' },
  { event_kind: 'teleported', occurred_at: '2026-09-02T11:00:00Z' },
]

describe('toStaffView — what the link-holder sees', () => {
  it('keeps the trip, the person, and their checkpoints', () => {
    const v = toStaffView(POISONED_TENANT, POISONED_ITINERARY, POISONED_RESOURCE, POISONED_EVENTS)
    expect(v.operatorName).toBe('Sawa Tours')
    expect(v.tripTitle).toBe('A complete Egypt tour')
    expect(v.memberName).toBe('Ahmed Hassan')
    expect(v.assignmentStart).toBe('2026-09-02')
    expect(v.events).toHaveLength(1) // note + bogus kinds dropped
    expect(v.events[0].kind).toBe('picked_up')
  })

  it('lets NOTHING internal survive — prices, customer, notes, ids', () => {
    const json = JSON.stringify(toStaffView(POISONED_TENANT, POISONED_ITINERARY, POISONED_RESOURCE, POISONED_EVENTS))
    for (const secret of [
      '4200', '3100', '25', 'cost', 'margin',
      'CUSTOMER-SECRET', '+2010SECRET', 'owner@secret.com', 'office@secret.com',
      'INTERNAL', 'cus_SECRET', 'TENANT-SECRET-ID', 'ITIN-SECRET-ID', 'RES-SECRET-ID',
    ]) {
      expect(json, `leaked: ${secret}`).not.toContain(secret)
    }
  })
})

describe('staff tokens', () => {
  it('generates tokens its own validator accepts', () => {
    expect(isValidStaffToken(generateStaffToken())).toBe(true)
  })
  it('rejects the wrong shapes', () => {
    for (const bad of ['', 'short', 'x'.repeat(64), '../../etc/passwd', 'zz probetoken0000000000000000ABC']) {
      expect(isValidStaffToken(bad), bad).toBe(false)
    }
  })
  it("the tap kinds never include the office-internal 'note'", () => {
    expect(STAFF_EVENT_KINDS).not.toContain('note')
  })
})

describe('resolveAssigneeContact — who gets the wa.me handoff', () => {
  const client = (tables: Record<string, Record<string, unknown> | null>) => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: tables[table] ?? null }) }),
      }),
    }),
  })

  it('resolves a driver from the directory, preferring whatsapp', async () => {
    const c = client({ team_members: { name: 'Mostafa Ali', phone: '+201', whatsapp: '+202' } })
    expect(await resolveAssigneeContact(c, { resource_type: 'driver', resource_id: 'tm-1' }))
      .toEqual({ name: 'Mostafa Ali', phone: '+202' })
  })

  it('resolves a vehicle through its default driver, falling back to the legacy phone', async () => {
    const linked = client({
      vehicles: { default_driver_id: 'tm-9', default_driver_name: 'Legacy', default_driver_phone: '+200' },
      team_members: { name: 'Real Driver', phone: '+209', whatsapp: null },
    })
    expect(await resolveAssigneeContact(linked, { resource_type: 'vehicle', resource_id: 'v-1' }))
      .toEqual({ name: 'Real Driver', phone: '+209' })

    const legacyOnly = client({
      vehicles: { default_driver_id: null, default_driver_name: 'Legacy', default_driver_phone: '+200' },
    })
    expect(await resolveAssigneeContact(legacyOnly, { resource_type: 'vehicle', resource_id: 'v-1' }))
      .toEqual({ name: 'Legacy', phone: '+200' })
  })

  it('resolves guides and hotel/airport staff from their own tables', async () => {
    const c = client({ guides: { name: 'Ahmed', phone: '+203', whatsapp: null } })
    expect(await resolveAssigneeContact(c, { resource_type: 'guide', resource_id: 'g-1' }))
      .toEqual({ name: 'Ahmed', phone: '+203' })
  })

  it('venues and unknowns resolve to null — a hotel is not a link-holder', async () => {
    const c = client({})
    expect(await resolveAssigneeContact(c, { resource_type: 'hotel', resource_id: 'h-1' })).toBeNull()
    expect(await resolveAssigneeContact(c, { resource_type: 'guide', resource_id: null })).toBeNull()
  })

  it('a missing row yields null, never a throw', async () => {
    const c = client({ guides: null })
    expect(await resolveAssigneeContact(c, { resource_type: 'guide', resource_id: 'g-404' })).toBeNull()
  })
})
