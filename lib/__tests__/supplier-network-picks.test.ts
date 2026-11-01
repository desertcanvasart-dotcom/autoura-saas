import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { NETWORK_LANGUAGES } from '@/lib/supplier-network-lists'
import { normalizePicks, splitPicks } from '@/lib/supplier-network-picks'
import { cleanProfile } from '@/lib/supplier-network-profile'
import { toConnectedProfile } from '@/lib/supplier-network-connected'

// 2026-11-01: suppliers typed cities and languages freely (some in Arabic,
// several in one box). The profile now picks from lists; what was typed
// before is read through normalizePicks. Their profile shows on the
// connected agency's supplier card.

describe('reading what suppliers typed', () => {
  it('splits "and" in English and Arabic, commas and slashes', () => {
    expect(splitPicks(['الاقصر وأسوان'])).toEqual(['الاقصر', 'أسوان'])
    expect(splitPicks(['Luxor and Aswan', 'Cairo / Giza, Siwa'])).toEqual(['Luxor', 'Aswan', 'Cairo', 'Giza', 'Siwa'])
  })

  it("maps the live profiles' Arabic words to the list", () => {
    expect(normalizePicks(['الاقصر وأسوان'], 'city')).toEqual({ known: ['Luxor', 'Aswan'], unknown: [] })
    expect(normalizePicks(['القاهرة', 'الجيزه'], 'city')).toEqual({ known: ['Cairo', 'Giza'], unknown: [] })
    expect(normalizePicks(['الإنجليزية والروسية'], 'language')).toEqual({ known: ['English', 'Russian'], unknown: [] })
  })

  it('is case-insensitive, keeps the list spelling, drops repeats, and reports what it cannot match', () => {
    expect(normalizePicks(['cairo', 'luxor', 'Cairo'], 'city')).toEqual({ known: ['Cairo', 'Luxor'], unknown: [] })
    expect(normalizePicks(['Japanese', 'Klingon'], 'language')).toEqual({ known: ['Japanese'], unknown: ['Klingon'] })
  })

  it('offers English first', () => {
    expect(NETWORK_LANGUAGES[0]).toBe('English')
  })
})

describe('saving a profile', () => {
  const base = { display_name: 'Nile Guide', kinds: ['guide'], listed: true }

  it('stores the list words, whatever was sent', () => {
    const r = cleanProfile({ ...base, cities: ['الاقصر وأسوان'], languages: ['الإنجليزية والروسية'] })
    expect(r).toMatchObject({ ok: true, value: { cities: ['Luxor', 'Aswan'], languages: ['English', 'Russian'] } })
  })

  it('refuses a city or language not on the list, naming it', () => {
    const r = cleanProfile({ ...base, cities: ['Atlantis'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Atlantis')
    expect(cleanProfile({ ...base, cities: ['Cairo'], languages: ['Klingon'] }).ok).toBe(false)
  })
})

describe("the agency's view of a connected supplier", () => {
  it('shows their words in the list spelling, never a phone, papers or review note', () => {
    const p = toConnectedProfile({
      account_id: 'a', display_name: 'Test Guide', kinds: ['guide'], cities: ['الاقصر وأسوان'], languages: ['الإنجليزية والروسية'],
      about: null, listed: true, verification_status: 'unverified', verification_note: 'secret', phone: '20100',
    })
    expect(p).toEqual({
      display_name: 'Test Guide', kinds: ['guide'], cities: ['Luxor', 'Aswan'], languages: ['English', 'Russian'],
      about: null, verification_status: 'unverified', in_network: false,
    })
  })

  it('is in the network only when verified and listed', () => {
    expect(toConnectedProfile({ verification_status: 'verified', listed: true }).in_network).toBe(true)
    expect(toConnectedProfile({ verification_status: 'verified', listed: false }).in_network).toBe(false)
  })

  it("reads only this agency's connections, and the profiles for exactly those accounts", () => {
    const src = readFileSync('app/api/suppliers/network-profiles/route.ts', 'utf8')
    expect(src).toContain(".eq('tenant_id', tenant_id).eq('status', 'approved')")
    expect(src).toContain(".in('account_id', [...new Set(accountOf.values())])")
    expect(src).toContain('toConnectedProfile(p)')
    expect(src).toContain(".select('account_id, display_name, kinds, cities, languages, about, listed, verification_status')")
  })

  it('the supplier card and list show it', () => {
    const page = readFileSync('app/suppliers/suppliers-content.tsx', 'utf8')
    expect(page).toContain('<SupplierProfileLine profile={connected.profiles[supplier.id]} />')
    expect(page).toContain('<SupplierNetworkProfile profile={connected.profiles[selectedSupplier.id]}')
  })
})

describe('browser bundles stay small', () => {
  it('no client component imports the Arabic name maps', () => {
    for (const f of ['app/supplier-home/NetworkJoin.tsx', 'components/SupplierNetworkProfile.tsx', 'lib/supplier-network.ts', 'lib/supplier-network-lists.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from '@\/lib\/supplier-network-picks'/)
      expect(src).not.toMatch(/import \{[^}]*\} from '@\/lib\/supplier-network-connected'/)
    }
  })
})

describe("the supplier's form", () => {
  it('picks from the lists and tells them how to appear in the network', () => {
    const form = readFileSync('app/supplier-home/NetworkJoin.tsx', 'utf8')
    expect(form).toContain('options={NETWORK_CITIES}')
    expect(form).toContain('options={NETWORK_LANGUAGES}')
    expect(form).toContain('Other agencies can’t find you yet.')
    expect(form).not.toContain('(comma between)')
  })
})
