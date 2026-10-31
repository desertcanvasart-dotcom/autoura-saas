import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { THEMES } from '../themes'
import { whatsappHref } from '../themes/blocks/contact'
import { backTo, landingFrom, readEnquiryForm, visitorIpOf, whatsAppLink, OUTCOME_ANCHOR } from '../lib/lead-capture'
import type { PagePayload, SiteResolution } from '@/lib/publish/contract'

// ============================================================================
// A visitor enquires (step 8): the form and the WhatsApp button, as the
// renderer handles them. No JavaScript and no cookies are needed for either;
// the site is always the one the hostname serves.
// ============================================================================

const SITE_ID = '00000000-0000-4000-8000-0000000000bb'
const PAGE_ID = '00000000-0000-4000-8000-0000000000cc'
const identity = { tagline: null, logoUrl: null, phone: null, email: 'hello@co.test', whatsapp: '+20 155 177 2258', address: null, licenseNumber: null }

const site: SiteResolution['site'] = {
  id: SITE_ID, tenantId: '00000000-0000-4000-8000-0000000000aa', archetype: 'private_journeys',
  status: 'draft', languages: ['en', 'fr'], companyName: 'Co Voyages', brand: {},
}

function tourPage(archetype: PagePayload['site']['archetype'], over: Partial<PagePayload> = {}): PagePayload {
  return {
    kind: 'tour', language: 'en', path: 'tours/saqqara', title: 'Saqqara',
    site: { id: SITE_ID, tenantId: site.tenantId, archetype, companyName: 'Co Voyages', languages: ['en', 'fr'], brand: {}, identity },
    alternates: [], tour: { templateId: '00000000-0000-4000-8000-0000000000dd', name: 'Saqqara', facts: null, narrative: null },
    tours: [], unpublished: false, pageId: PAGE_ID, ...over,
  }
}

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('reading the form', () => {
  const landing = new URL('https://co.example/en/tours/saqqara?utm_source=google')

  it('takes the site from the hostname and the fields from the form', () => {
    expect(readEnquiryForm(form({
      lang: 'fr', page: PAGE_ID, name: ' Lena ', email: 'lena@example.com', phone: '', travellers: '3', travel_date: '2027-03', message: '', website: '',
    }), { site, landing, visitorIp: '203.0.113.9' })).toEqual({
      siteId: SITE_ID, pageId: PAGE_ID, language: 'fr', name: 'Lena', email: 'lena@example.com', phone: null,
      travellers: 3, travelDate: '2027-03', message: null, landingUrl: landing.toString(), visitorIp: '203.0.113.9',
      whatsapp: null, country: null, nights: null, adults: null, children: null, interests: [], consent: false,
    })
  })

  it('the Contact page\'s fuller form: WhatsApp, country, nights, adults and children (their sum is the travellers), interests, consent', () => {
    const f = form({ lang: 'en', name: 'Ana', email: 'ana@example.com', whatsapp: '+34 600 000 000', country: 'Spain', travel_date: '2026-12-10',
      nights: '7', adults: '2', children: '1', consent: 'yes' })
    f.append('interests', 'Luxor'); f.append('interests', 'Aswan'); f.append('interests', 'Luxor')
    expect(readEnquiryForm(f, { site, landing: null, visitorIp: null })).toMatchObject({
      whatsapp: '+34 600 000 000', country: 'Spain', nights: 7, adults: 2, children: 1, travellers: 3, interests: ['Luxor', 'Aswan'], consent: true,
    })
    expect(readEnquiryForm(form({ name: 'A', email: 'a@b.co', nights: '400', adults: '0', children: '-1' }), { site, landing: null, visitorIp: null }))
      .toMatchObject({ nights: null, adults: null, children: null, travellers: null, consent: false })
  })

  it('drops what does not belong: a bad page id, an unknown language, odd numbers and dates', () => {
    const r = readEnquiryForm(form({ lang: 'ar', page: 'x', name: 'A', email: 'a@b.co', travellers: '0', travel_date: 'next spring' }), { site, landing: null, visitorIp: null })
    expect(r).toMatchObject({ pageId: null, language: 'en', travellers: null, travelDate: null, landingUrl: null })
  })

  it('a filled hidden field is a bot', () => {
    expect(readEnquiryForm(form({ name: 'A', email: 'a@b.co', website: 'http://spam' }), { site, landing, visitorIp: null })).toBe('spam')
  })
})

describe('sending the visitor back', () => {
  it('to their own page on this hostname, at the anchor that says how it went', () => {
    const landing = landingFrom('https://co.example/en/tours/saqqara?campaign=nile', 'co.example')
    expect(backTo(landing, 'en', OUTCOME_ANCHOR.sent)).toBe('/en/tours/saqqara?campaign=nile#enquiry-sent')
  })

  it('never to another site named in the Referer', () => {
    expect(landingFrom('https://evil.example/phish', 'co.example')).toBeNull()
    expect(backTo(null, 'fr', OUTCOME_ANCHOR.failed)).toBe('/fr#enquiry-failed')
  })

  it("the visitor's address is the hop the platform's edge appended, never one the visitor wrote", () => {
    // The visitor sent "1.1.1.1" themselves; the edge appended what it saw.
    expect(visitorIpOf(new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }))).toBe('203.0.113.9')
    expect(visitorIpOf(new Headers({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9')
    expect(visitorIpOf(new Headers({ 'x-real-ip': '192.0.2.5' }))).toBe('192.0.2.5')
    expect(visitorIpOf(new Headers({ 'x-forwarded-for': 'not-an-ip' }))).toBeNull()
    expect(visitorIpOf(new Headers())).toBeNull()
  })
})

describe('the WhatsApp button', () => {
  it('opens WhatsApp on the company number with the tour and the reference', () => {
    const link = whatsAppLink({ number: '+201551772258', token: 'ABCD2345', tourName: 'Saqqara' }, 'en')!
    expect(link.startsWith('https://wa.me/201551772258?text=')).toBe(true)
    expect(decodeURIComponent(link.split('text=')[1])).toBe('Hello, I am interested in Saqqara.\n\nRef: ABCD2345')
    expect(whatsAppLink({ number: null, token: null, tourName: null }, 'en')).toBeNull()
  })

  it('past the click limit (no reference made) still opens WhatsApp, without a Ref line', () => {
    const link = whatsAppLink({ number: '+201551772258', token: null, tourName: 'Saqqara' }, 'en')!
    expect(decodeURIComponent(link.split('text=')[1])).toBe('Hello, I am interested in Saqqara.')
  })

  it('goes through the tracked route, and only for a company with its own number', () => {
    expect(whatsappHref(tourPage('private_journeys'))).toBe(`/api/wa?lang=en&page=${PAGE_ID}`)
    expect(whatsappHref(tourPage('private_journeys', { site: { ...tourPage('private_journeys').site, identity: { ...identity, whatsapp: null } } }))).toBeNull()
  })
})

describe('both themes show the form on a tour page', () => {
  for (const archetype of ['private_journeys', 'transparent_value'] as const) {
    it(archetype, () => {
      const theme = THEMES[archetype]
      const page = tourPage(archetype)
      const html = renderToStaticMarkup(<theme.Frame page={page} preview={false}><theme.Page page={page} preview={false} /></theme.Frame>)
      expect(html).toContain('action="/api/enquire"')
      expect(html).toContain(`name="page" value="${PAGE_ID}"`)
      expect(html).toContain('id="enquiry-sent"')
      expect(html).toContain(`/api/wa?lang=en&amp;page=${PAGE_ID}`)
      expect(html).not.toContain('wa.me/')
    })
  }
})
