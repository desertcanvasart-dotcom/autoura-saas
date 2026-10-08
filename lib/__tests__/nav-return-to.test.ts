// Back from a trip's booking, invoice, contract or supplier documents returns
// to the trip (lib/nav/return-to, components/nav/TripNav). Before, each of
// those pages' back arrow went to its own list (ported from travel-ops-pro), and getting back to the trip
// meant the sidebar and a search.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeReturnPath, withReturnTo, tripIdOfPath } from '@/lib/nav/return-to'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('safeReturnPath', () => {
  it('keeps a path on this site', () => {
    expect(safeReturnPath('/itineraries/abc')).toBe('/itineraries/abc')
    expect(safeReturnPath('/documents/supplier?itineraryId=abc')).toBe('/documents/supplier?itineraryId=abc')
  })

  it('refuses anything that could leave the site', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'itineraries/abc', '/a\nb', '', null, undefined, '/' + 'a'.repeat(600)]) {
      expect(safeReturnPath(bad as string)).toBeNull()
    }
  })
})

describe('withReturnTo', () => {
  it('adds ?from=, or &from= after an existing query, before any hash', () => {
    expect(withReturnTo('/bookings/b1', '/itineraries/t1')).toBe('/bookings/b1?from=%2Fitineraries%2Ft1')
    expect(withReturnTo('/x?a=1', '/itineraries/t1')).toBe('/x?a=1&from=%2Fitineraries%2Ft1')
    expect(withReturnTo('/x#pay', '/itineraries/t1')).toBe('/x?from=%2Fitineraries%2Ft1#pay')
  })

  it('leaves the link alone when the origin is not a safe path', () => {
    expect(withReturnTo('/bookings/b1', 'https://evil.example')).toBe('/bookings/b1')
    expect(withReturnTo('/bookings/b1', null)).toBe('/bookings/b1')
  })

  it('round-trips through the URL', () => {
    const from = '/documents/supplier?itineraryId=t1'
    const url = new URL(withReturnTo('/documents/supplier/d1', from), 'https://app.example')
    expect(safeReturnPath(url.searchParams.get('from'))).toBe(from)
  })
})

describe('tripIdOfPath', () => {
  it('names the trip of a trip page or its edit page', () => {
    expect(tripIdOfPath('/itineraries/t1')).toBe('t1')
    expect(tripIdOfPath('/itineraries/t1/edit')).toBe('t1')
    expect(tripIdOfPath('/itineraries/t1?tab=x')).toBe('t1')
  })

  it('is null for anything else', () => {
    for (const p of ['/itineraries', '/itineraries/new', '/itineraries/t1/days', '/bookings/b1', null]) {
      expect(tripIdOfPath(p)).toBeNull()
    }
  })
})

describe('the pages', () => {
  it("the trip page's links out carry the trip as their origin", () => {
    const page = read('app/itineraries/[id]/page.tsx')
    expect(page).toContain('fromThisTrip(`/bookings/${booking.id}`)')
    expect(page).toContain('fromThisTrip(`/invoices/${existingInvoice.id}`)')
    expect(page).toContain('fromThisTrip(`/documents/contract/${itinerary.id}`)')
    expect(page).not.toMatch(/href=\{`\/(bookings|invoices)\/\$\{/)
    expect(page).not.toMatch(/router\.push\(`\/invoices\//)
    // The booking button and the invoices panel carry it too.
    expect(read('components/ItineraryBookingAction.tsx')).toContain('withReturnTo(`/bookings/${id}`')
    expect(read('components/itineraries/InvoicesPayments.tsx')).toContain('withReturnTo(`/invoices/${inv.id}`')
  })

  it.each([
    ['app/bookings/[id]/page.tsx', '/bookings'],
    ['app/invoices/[id]/page.tsx', '/invoices'],
    ['app/documents/supplier/[id]/page.tsx', '/documents/supplier'],
  ])('%s goes back through BackLink, with its list as the fallback', (file, list) => {
    const src = read(file)
    expect(src).toContain(`<BackLink fallbackHref="${list}"`)
    expect(src).toContain('<TripBreadcrumb')
  })

  it('the contract falls back to its own trip, not the Itineraries list', () => {
    const src = read('app/documents/contract/[id]/page.tsx')
    expect(src).toContain('<BackLink fallbackHref={`/itineraries/${itinerary.id}`}')
    expect(src).toContain('<TripBreadcrumb')
  })
})
