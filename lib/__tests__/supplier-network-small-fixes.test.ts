// Four small fixes from the 2026-10-30 end-to-end test.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { agencyDateTime, agencyTimeZone } from '@/lib/agency-time'

const read = (p: string) => readFileSync(p, 'utf8')

describe("deadlines on supplier pages read in the agency's clock", () => {
  it('a real timezone wins; the column default UTC does not; then the country; else UTC', () => {
    expect(agencyTimeZone('Africa/Cairo', null)).toBe('Africa/Cairo')
    expect(agencyTimeZone('UTC', 'Egypt')).toBe('Africa/Cairo')
    expect(agencyTimeZone(null, 'Morocco')).toBe('Africa/Casablanca')
    expect(agencyTimeZone('Not/AZone', 'Egypt')).toBe('Africa/Cairo')
    expect(agencyTimeZone('UTC', null)).toBe('UTC')
  })

  it('20:03 UTC reads 22:03 in Cairo; with no clock it says UTC', () => {
    expect(agencyDateTime('2026-10-30T20:03:00Z', 'Africa/Cairo')).toBe('30 Oct, 22:03')
    expect(agencyDateTime('2026-10-30T20:03:00Z', 'UTC')).toBe('30 Oct, 20:03 UTC')
  })

  it('the shared supplier view uses it', () => {
    expect(read('components/supplier/SupplierAgencyView.tsx')).toContain('agencyDateTime(l.replyBy, data.timeZone)')
    expect(read('lib/supplier-page-data.ts')).toContain('agencyTimeZone(')
  })
})

describe('the other three', () => {
  it('the cost box redraws when the supplier or quoted cost changes', () => {
    expect(read('components/booking/BookingSuppliersPanel.tsx')).toContain("key={`${r.id}:${r.confirmed_cost ?? ''}:${r.quoted_cost ?? ''}:${r.supplier_name}`}")
  })

  it('opening the inbox marks its requests as seen', () => {
    const home = read('app/supplier-home/page.tsx')
    expect(home).toContain(".from('service_booking_links').update({ last_opened_at:")
    expect(home).toContain(".in('service_booking_id', shown).is('revoked_at', null)")
  })

  it('page titles do not repeat the brand (the layout adds "· Autoura")', () => {
    for (const f of ['app/reply/[token]/page.tsx', 'app/supplier-home/page.tsx', 'app/supplier-login/page.tsx', 'app/supplier/[token]/page.tsx']) {
      expect(read(f), f).not.toMatch(/title: '[^']*· Autoura'/)
    }
  })
})
