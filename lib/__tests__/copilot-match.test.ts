import { describe, it, expect, vi } from 'vitest'
import { extractPax, extractTravelDate, matchByName, matchEnquiry, readMatchAnswer, type TourCandidate } from '@/lib/copilot-match'

// Which tours an enquiry is about (lib/copilot-match.ts).

const TOURS: TourCandidate[] = [
  { id: 'giza', name: 'Giza Pyramids & Saqqara Private Day Tour', code: 'T2E-DT-01', slugs: ['giza-pyramids-saqqara-day-tour'] },
  { id: 'luxor', name: 'Ultimate Luxor Day Tour', code: 'T2E-DT-07', slugs: ['ultimate-luxor-day-tour'] },
  { id: 'aswan', name: 'Aswan City Tour', code: 'T2E-DT-09', slugs: [] },
  { id: 'cruise', name: '4-Night Nile Cruise Luxor to Aswan', code: null, slugs: [] },
]

describe('matchByName', () => {
  it('an exact name wins', () => {
    expect(matchByName(TOURS, 'Hi, is the Ultimate Luxor Day Tour available?')).toEqual(['luxor'])
  })

  it('most of the significant words match fuzzily (plural, punctuation)', () => {
    expect(matchByName(TOURS, 'We would love the Giza pyramid and Saqqara trip')).toEqual(['giza'])
  })

  it('a website form page URL carries the slug', () => {
    expect(matchByName(TOURS, 'Please send a price', 'https://travel2egypt.org/tours/giza-pyramids-saqqara-day-tour?utm=x')).toEqual(['giza'])
  })

  it('one generic word is not a match', () => {
    expect(matchByName(TOURS, 'Can we see the pyramids?')).toEqual([])
  })

  it('never more than three', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, name: `Cairo Highlights ${i}`, slugs: [] }))
    expect(matchByName(many, 'cairo highlights please').length).toBeLessThanOrEqual(3)
  })
})

describe('extractPax', () => {
  it.each([
    ['family of 4, kids 8 and 14', 4],
    ['We are 6 people travelling', 6],
    ['2 adults and 2 children', 4],
    ['two adults, one child', 3],
    ['a group of twelve friends', 12],
    ['my wife and I', 2],
    ['5 pax', 5],
    ['Hello, do you run tours?', null],
  ])('%s → %s', (text, pax) => {
    expect(extractPax(text)).toBe(pax)
  })
})

describe('extractTravelDate', () => {
  const today = new Date('2026-11-26T12:00:00Z')
  it.each([
    ['pyramids, 13 March', '2027-03-13'],
    ['on the 13th of March 2027', '2027-03-13'],
    ['March 13th', '2027-03-13'],
    ['arriving 2 December', '2026-12-02'],
    ['13/03/2027', '2027-03-13'],
    ['2027-03-13', '2027-03-13'],
    ['sometime in spring', null],
    ['31 February', null],
  ])('%s → %s', (text, date) => {
    expect(extractTravelDate(text, today)).toBe(date)
  })
})

describe('readMatchAnswer', () => {
  it('keeps only catalogue ids and valid fields', () => {
    expect(readMatchAnswer('ok {"templateIds":["giza","made-up"],"travelDate":"2027-03-13","pax":4}', new Set(['giza'])))
      .toEqual({ templateIds: ['giza'], travelDate: '2027-03-13', pax: 4 })
    expect(readMatchAnswer('{"templateIds":[],"travelDate":"13 March","pax":0}', new Set()))
      .toEqual({ templateIds: [], travelDate: null, pax: null })
    expect(readMatchAnswer('no json', new Set())).toBeNull()
  })
})

function fakeDb() {
  const templates = TOURS.map(t => ({ id: t.id, tenant_id: 'T', template_name: t.name, template_code: t.code ?? null, is_active: true }))
  return {
    from(table: string) {
      const data = table === 'tour_templates' ? templates : []
      const q = { select: () => q, eq: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(r) }
      return q
    },
  }
}

describe('matchEnquiry', () => {
  it('does not ask the model when a name matched', async () => {
    const ask = vi.fn()
    const r = await matchEnquiry(fakeDb(), { tenantId: 'T', text: 'Ultimate Luxor Day Tour for 2 people on 5 April', ask, allowModel: async () => true, today: new Date('2026-11-26') })
    expect(r).toEqual({ templateIds: ['luxor'], travelDate: '2027-04-05', pax: 2, usedModel: false })
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks the model once when nothing matched by name, counted against the ceiling', async () => {
    const ask = vi.fn(async () => '{"templateIds":["giza"],"travelDate":null,"pax":null}')
    const allowModel = vi.fn(async () => true)
    const r = await matchEnquiry(fakeDb(), { tenantId: 'T', text: 'Family of 4, kids 8 and 14, pyramids, 13 March', ask, allowModel, today: new Date('2026-11-26') })
    expect(allowModel).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ templateIds: ['giza'], travelDate: '2027-03-13', pax: 4, usedModel: true })
  })

  it('over the AI ceiling: no model call, no tours', async () => {
    const ask = vi.fn()
    const r = await matchEnquiry(fakeDb(), { tenantId: 'T', text: 'pyramids please', ask, allowModel: async () => false })
    expect(ask).not.toHaveBeenCalled()
    expect(r.templateIds).toEqual([])
    expect(r.usedModel).toBe(false)
  })
})
