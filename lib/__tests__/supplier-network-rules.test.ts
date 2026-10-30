import { describe, it, expect } from 'vitest'
import { cleanProfile, isSourcing, matchesSearch, toPublicProfile, usesNetwork } from '@/lib/supplier-network'

describe('the shared network — rules', () => {
  it('one sourcing setting per agency: own (default) · network · both', () => {
    expect(['own', 'network', 'both'].every(isSourcing)).toBe(true)
    expect(isSourcing('everything')).toBe(false)
    expect(usesNetwork('own')).toBe(false)
    expect(usesNetwork(null)).toBe(false)
    expect(usesNetwork('both')).toBe(true)
  })

  it('a profile needs a name, a known kind and a city; lists are tidied', () => {
    const ok = cleanProfile({ display_name: '  Nile  Cars ', kinds: ['transport_company', 'spaceship'], cities: 'Cairo, Giza, cairo ', languages: ['English', 'English'], listed: true })
    expect(ok).toEqual({ ok: true, value: { display_name: 'Nile Cars', kinds: ['transport_company'], cities: ['Cairo', 'Giza', 'cairo'], languages: ['English'], about: null, listed: true } })
    expect(cleanProfile({ display_name: 'X', kinds: ['guide'], cities: ['Cairo'] }).ok).toBe(false)
    expect(cleanProfile({ display_name: 'Nile', kinds: ['spaceship'], cities: ['Cairo'] }).ok).toBe(false)
    expect(cleanProfile({ display_name: 'Nile', kinds: ['guide'], cities: [] }).ok).toBe(false)
    expect((cleanProfile({ display_name: 'Nile', kinds: ['guide'], cities: ['Cairo'] }) as { value: { listed: boolean } }).value.listed).toBe(false)
  })

  it('another agency never sees a phone, email, papers or review note', () => {
    const p = toPublicProfile({ account_id: 'a', display_name: 'Nile', kinds: ['guide'], cities: ['Luxor'], languages: [], about: null, phone: '2010', email: 'x@y', verification_note: 'id blurry', storage_path: 'k' })
    expect(Object.keys(p).sort()).toEqual(['about', 'account_id', 'cities', 'display_name', 'kinds', 'languages'])
  })

  it('search by kind, city, language and words — case-insensitive', () => {
    const p = toPublicProfile({ account_id: 'a', display_name: 'Luxor Guides', kinds: ['guide'], cities: ['Luxor', 'Aswan'], languages: ['English', 'Italian'], about: 'Egyptologists' })
    expect(matchesSearch(p, { kind: 'guide', city: 'luxor', language: 'italian' })).toBe(true)
    expect(matchesSearch(p, { text: 'egyptolog' })).toBe(true)
    expect(matchesSearch(p, { kind: 'transport_company' })).toBe(false)
    expect(matchesSearch(p, { city: 'Cairo' })).toBe(false)
  })
})
