import { describe, it, expect } from 'vitest'
import {
  assignWhat, buildServiceRequestMessage, generateReplyToken, isLinkLive, isValidReplyToken,
  parseSupplierAction, replyLinkExpiry, targetStatus, toSupplierView,
} from '@/lib/supplier-reply-link'

describe('the reply link', () => {
  it('is a share-strength token', () => {
    const t = generateReplyToken()
    expect(isValidReplyToken(t)).toBe(true)
    expect(isValidReplyToken('nope')).toBe(false)
  })

  it('expires the day after the service; no date, no expiry', () => {
    expect(replyLinkExpiry('2027-01-02')).toBe('2027-01-03T23:59:59.000Z')
    expect(replyLinkExpiry(null)).toBeNull()
  })

  it('stops working when revoked or expired', () => {
    const now = new Date('2027-01-03T12:00:00Z')
    expect(isLinkLive({ expires_at: '2027-01-03T23:59:59Z' }, now)).toBe(true)
    expect(isLinkLive({ expires_at: '2027-01-02T23:59:59Z' }, now)).toBe(false)
    expect(isLinkLive({ revoked_at: '2027-01-01T00:00:00Z' }, now)).toBe(false)
    expect(isLinkLive({}, now)).toBe(true)
  })
})

describe('what the supplier sees', () => {
  const view = toSupplierView(
    { company_name: 'Nile Tours', bank_details: 'SECRET' },
    { client_name: 'Ms Smith', client_email: 'smith@example.com' },
    {
      supplier_name: 'Cairo Cars', supplier_type: 'transport', service_description: 'Airport → hotel',
      service_date: '2027-01-02', service_time: '14:30:00', pickup_location: 'CAI T2', pax: 2,
      status: 'requested', quoted_cost: 40, confirmed_cost: 40, contact_phone: '+20…',
    },
  )

  it('the service asked for, the lead name for the sign — no prices, no client contact', () => {
    expect(view).toMatchObject({
      operatorName: 'Nile Tours', supplierName: 'Cairo Cars', service: 'Airport → hotel',
      serviceDate: '2027-01-02', serviceTime: '14:30', pickup: 'CAI T2', guests: 2, clientName: 'Ms Smith',
      status: 'requested', assign: 'car',
    })
    const text = JSON.stringify(view)
    expect(text).not.toContain('smith@example.com')
    expect(text).not.toContain('SECRET')
    expect(Object.keys(view)).not.toContain('cost')
    expect(text).not.toMatch(/"40"|:40[,}]/)
  })
})

describe('a tap', () => {
  it('accept and decline need nothing; naming needs the plate (car) or the name (guide)', () => {
    expect(parseSupplierAction({ action: 'accept' }, 'car')).toEqual({ ok: true, value: { action: 'accept' } })
    expect(parseSupplierAction({ action: 'decline', reason: '  fully   booked ' }, 'car')).toEqual({ ok: true, value: { action: 'decline', reason: 'fully booked' } })
    expect(parseSupplierAction({ action: 'assign', plate: '' }, 'car').ok).toBe(false)
    expect(parseSupplierAction({ action: 'assign', guide_name: '' }, 'guide').ok).toBe(false)
    expect(parseSupplierAction({ action: 'assign', plate: 'x' }, 'none').ok).toBe(false)
    expect(parseSupplierAction({ action: 'hack' }, 'car').ok).toBe(false)
  })

  it('a plate is upper-cased; the driver of the day is only a note (D1)', () => {
    const r = parseSupplierAction({ action: 'assign', plate: ' abc 123 ', driver_note: 'Ali 0100' }, 'car')
    expect(r).toEqual({ ok: true, value: { action: 'assign', plate: 'ABC 123', guide_name: null, guide_phone: null, driver_note: 'Ali 0100' } })
  })

  it('moves the line: accept → accepted, decline → declined, a named car or guide → assigned', () => {
    expect(targetStatus({ action: 'accept' })).toBe('accepted')
    expect(targetStatus({ action: 'decline' })).toBe('declined')
    expect(targetStatus({ action: 'assign', plate: 'A' })).toBe('assigned')
  })

  it('cars name a plate, guides a guide, the rest just accept', () => {
    expect(assignWhat('transport')).toBe('car')
    expect(assignWhat('guide')).toBe('guide')
    expect(assignWhat('restaurant')).toBe('none')
  })
})

describe('the message sent from the office\'s own WhatsApp', () => {
  it('says what, when, where, how long to answer, and carries the link', () => {
    const m = buildServiceRequestMessage({
      supplierName: 'Ahmed Cars Co', agency: 'Nile Tours', service: 'Airport → hotel', serviceDate: '2027-01-02',
      serviceTime: '14:30:00', pickup: 'CAI T2', guests: 2, clientName: 'Ms Smith', replyHours: 1, assign: 'car',
      url: 'https://app.example/reply/abc',
    })
    expect(m).toContain('Hello Ahmed,')
    expect(m).toContain('Booking request from Nile Tours:')
    expect(m).toContain('Sat, 2 Jan 2027 at 14:30')
    expect(m).toContain('Pickup: CAI T2')
    expect(m).toContain('answer within 1 hour with one tap')
    expect(m).toContain('name the car (plate)')
    expect(m.trim().endsWith('https://app.example/reply/abc')).toBe(true)
  })
})
