// A company's own website sends its enquiry form to the app (migration 464):
// validated, filed once per reference, with every answer in the client note.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { validateExternalEnquiry, nameFromEmail, enquiryNote, whenLabel, type ExternalEnquiry } from '@/lib/publish/external-enquiry'

const body = {
  brand: 'travel2egypt', reference: 'T2E-7KQ2MX', kind: 'trip', email: ' John.Smith88@Example.com ',
  whatsapp: '+447700900123', locale: 'en', travel_month: '2027-03', adults: 2, children: 1, child_ages: '9',
  budget: '$3,000–$5,000 pp', tour_title: 'Nile & Pyramids 8 days', tour_url: 'https://travel2egypt.org/nile-8',
  notes: 'Anniversary trip', page_url: '/en/tours/nile-8', utm: { utm_source: 'google', utm_campaign: 'spring' },
  style_answer: ['culture', 'relaxed'],
}

describe('validateExternalEnquiry', () => {
  it('reads the site\'s body, trimmed and lower-cased', () => {
    const v = validateExternalEnquiry(body)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.enquiry).toMatchObject({ brand: 'travel2egypt', reference: 'T2E-7KQ2MX', email: 'john.smith88@example.com', adults: 2, children: 1, styleAnswer: 'culture, relaxed' })
    expect(v.enquiry.utm).toEqual({ source: 'google', campaign: 'spring' })
  })

  it('refuses a missing brand, a bad reference or a bad email', () => {
    expect(validateExternalEnquiry({ ...body, brand: '' })).toMatchObject({ ok: false, field: 'brand' })
    expect(validateExternalEnquiry({ ...body, reference: 'x y' })).toMatchObject({ ok: false, field: 'reference' })
    expect(validateExternalEnquiry({ ...body, email: 'nope' })).toMatchObject({ ok: false, field: 'email' })
    expect(validateExternalEnquiry(null)).toMatchObject({ ok: false })
  })

  it('drops a malformed date and a nonsense party size', () => {
    const v = validateExternalEnquiry({ ...body, start_date: '12/03/2027', adults: -1 })
    expect(v.ok && v.enquiry.startDate).toBe(null)
    expect(v.ok && v.enquiry.adults).toBe(null)
  })
})

describe('what the team reads', () => {
  it('a name from the email when the form asks for none', () => {
    expect(nameFromEmail('john.smith88@example.com')).toBe('John Smith')
    expect(nameFromEmail('a1@x.com')).toBe('Website Lead')
  })

  it('when: dates, else the month', () => {
    expect(whenLabel({ startDate: '2027-03-02', endDate: '2027-03-10', travelMonth: null })).toBe('2027-03-02 → 2027-03-10')
    expect(whenLabel({ startDate: null, endDate: null, travelMonth: '2027-03' })).toBe('March 2027')
    expect(whenLabel({ startDate: null, endDate: null, travelMonth: null })).toBe(null)
  })

  it('the note carries the reference and every answer', () => {
    const v = validateExternalEnquiry(body)
    const note = enquiryNote((v as { enquiry: ExternalEnquiry }).enquiry)
    expect(note).toContain('[Website enquiry T2E-7KQ2MX]')
    expect(note).toContain('Travellers: 2 adults, 1 child (ages 9)')
    expect(note).toContain('When: March 2027')
    expect(note).toContain('Anniversary trip')
  })
})

describe('464_publish_enquiry_external_ref', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`create table publish_enquiries(id serial primary key, tenant_id uuid not null, site_id uuid);`)
    const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/464_publish_enquiry_external_ref.sql'), 'utf8')
    await db.exec(mig)
    await db.exec(mig)
  }, 60_000)

  it('one enquiry per company per reference; app-site enquiries carry none', async () => {
    const a = '00000000-0000-0000-0000-00000000000a', b = '00000000-0000-0000-0000-00000000000b'
    await db.exec(`insert into publish_enquiries(tenant_id, external_ref) values ('${a}', 'T2E-1'), ('${b}', 'T2E-1'), ('${a}', null), ('${a}', null)`)
    await expect(db.exec(`insert into publish_enquiries(tenant_id, external_ref) values ('${a}', 'T2E-1')`)).rejects.toThrow()
  })
})
