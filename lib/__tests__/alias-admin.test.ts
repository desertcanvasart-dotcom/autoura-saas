// Managing an agency's attraction aliases — the rules behind Settings →
// Attraction names.
//
// The 27 global aliases this replaces taught two things: nine pointed at names
// on NOBODY's fee sheet and quietly turned right wording into "no fee"; and
// nobody could see that, because there was nowhere to look. So an alias into
// thin air is refused when it is saved, and shown as broken if the sheet
// changes under it later.
import { describe, it, expect } from 'vitest'
import { aliasHealth, validateAlias, unresolvedWordings, canonicalParts } from '@/lib/pricing/alias-admin'

// The live names.
const FEES = [
  'Valley Of Kings', 'Hatshepsut Temple', 'Salah Eldin Citadel', 'Qaitbay Citadel', 'Giza Plateau',
  'Egyptian Museum', 'The Grand Egyptian Museum (GEM)', 'Abu Simbel Temple', 'Abu Simbel Sound & Light',
  'Saqqara', 'Saqqara Monuments', 'Karnak Temple',
].map(attraction_name => ({ attraction_name, city: 'Somewhere' }))

describe('does an alias still land on a fee?', () => {
  it('yes, under the sheet\'s own spelling', () => {
    expect(aliasHealth('valley of kings', FEES)).toEqual({ ok: true, fees: ['Valley Of Kings'] })
  })

  it('a combo lands only when every part does', () => {
    expect(aliasHealth('Giza Plateau + Egyptian Museum', FEES)).toEqual({ ok: true, fees: ['Giza Plateau', 'Egyptian Museum'] })
    const broken = aliasHealth('Giza Plateau + Sphinx Area', FEES)
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.problem).toMatch(/no fee called "Sphinx Area"/)
  })

  it('the old global canonicals are exactly the broken kind', () => {
    for (const dead of ['Valley of the Kings', 'Citadel of Saladin', 'Pyramids of Giza', 'Edfu Temple']) {
      expect(aliasHealth(dead, FEES).ok, dead).toBe(false)
    }
  })

  it('a name that fits several fees is not a target — it is a coin toss', () => {
    const r = aliasHealth('Abu Simbel', FEES)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problem).toMatch(/fits 2 fees/)
    // …while the exact name among several is fine.
    expect(aliasHealth('Saqqara', FEES)).toEqual({ ok: true, fees: ['Saqqara'] })
  })
})

describe('may this alias be saved?', () => {
  const save = (alias: unknown, canonical: unknown, existing = [] as Array<{ id: string; alias: string; canonical: string }>, selfId?: string) =>
    validateAlias({ alias, canonical }, FEES, existing, selfId)

  it('yes — and it is stored under the sheet\'s spelling, tidied', () => {
    expect(save('  Valley  of the Kings ', 'valley of kings')).toEqual({ ok: true, alias: 'Valley of the Kings', canonical: 'Valley Of Kings' })
  })

  it('not into thin air — the fault the global rows had', () => {
    const r = save('Citadel', 'Citadel of Saladin')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no fee called "Citadel of Saladin"/)
  })

  it('not at a name that fits several fees', () => {
    const r = save('The citadel', 'Citadel')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/fits 2 fees/)
  })

  it('a wording means one thing: a second alias for it is refused, naming the first', () => {
    const r = save('citadel', 'Qaitbay Citadel', [{ id: 'a1', alias: 'Citadel', canonical: 'Salah Eldin Citadel' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/"Citadel" already has an alias \(→ Salah Eldin Citadel\)/)
  })

  it('…but editing a row does not collide with itself', () => {
    expect(save('Citadel', 'Qaitbay Citadel', [{ id: 'a1', alias: 'Citadel', canonical: 'Salah Eldin Citadel' }], 'a1').ok).toBe(true)
  })

  it('blank, over-long, a combo on the wrong side, a fee listed twice — each says what is wrong', () => {
    expect(save('', 'Saqqara')).toMatchObject({ ok: false, error: expect.stringMatching(/what the tour says/) })
    expect(save('Saqqara ruins', '')).toMatchObject({ ok: false, error: expect.stringMatching(/Choose the fee/) })
    expect(save('x'.repeat(121), 'Saqqara')).toMatchObject({ ok: false, error: expect.stringMatching(/under 120/) })
    expect(save('Giza + Museum', 'Giza Plateau')).toMatchObject({ ok: false, error: expect.stringMatching(/one attraction/) })
    expect(save('Both', 'Saqqara + saqqara')).toMatchObject({ ok: false, error: expect.stringMatching(/listed twice/) })
  })

  it('a fee needs no alias to itself', () => {
    expect(save('karnak temple', 'Karnak Temple')).toMatchObject({ ok: false, error: expect.stringMatching(/needs no alias/) })
  })

  it('rewriting wording that is ALREADY a fee is allowed — and said out loud', () => {
    // The trap the globals fell into. The agency may want it (its "Saqqara"
    // tours mean the combined ticket); it must not happen silently.
    const r = save('Saqqara', 'Saqqara Monuments')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.note).toMatch(/"Saqqara" is itself a fee on your sheet/)
  })
})

describe('what the agency\'s tours say that reaches no fee', () => {
  const tour = (template_name: string, ...days: Array<Record<string, unknown>>) => ({ template_name, itinerary: days })
  const own = (alias: string, canonical: string) => ({ alias, canonical, tenant_id: 't1' })

  it('lists each wording once, with how many days and which tours', () => {
    const found = unresolvedWordings([
      tour('Nile in Depth', { attractions: ['Valley of the Kings', 'Karnak Temple'] }, { attractions: ['Valley of the Kings'] }),
      tour('Luxor Day', { attractions: ['valley of the kings'] }),
    ], [], FEES)
    expect(found).toEqual([{ wording: 'Valley of the Kings', lookedUpAs: 'Valley of the Kings', days: 3, tours: ['Nile in Depth', 'Luxor Day'], reason: 'no_fee', candidates: [] }])
  })

  it('goes quiet once the agency has an alias for it', () => {
    const tours = [tour('Luxor Day', { attractions: ['Valley of the Kings'] })]
    expect(unresolvedWordings(tours, [own('valley of the kings', 'Valley Of Kings')], FEES)).toEqual([])
  })

  it('names the candidates when a wording fits several fees', () => {
    const [u] = unresolvedWordings([tour('Aswan', { attractions: ['Abu Simbel'] })], [], FEES)
    expect(u).toMatchObject({ reason: 'several_fees', candidates: ['Abu Simbel Temple', 'Abu Simbel Sound & Light'] })
  })

  it('shows what an alias turned the wording into, when THAT is what finds nothing', () => {
    const [u] = unresolvedWordings([tour('Cairo', { attractions: ['Citadel'] })], [own('citadel', 'Citadel of Saladin')], FEES)
    expect(u).toMatchObject({ wording: 'Citadel', lookedUpAs: 'Citadel of Saladin', reason: 'no_fee' })
  })

  it('a day that PICKED its fees is silent — its wording is not what is priced', () => {
    expect(unresolvedWordings([tour('Cairo', { attractions: ['Nowhere at all'], attraction_ids: ['fee-1'] })], [], FEES)).toEqual([])
  })

  it('somebody else\'s alias, or a global one, does not quieten it', () => {
    const tours = [tour('Luxor Day', { attractions: ['Valley of the Kings'] })]
    const foreign = [{ alias: 'valley of the kings', canonical: 'Valley Of Kings', tenant_id: null }]
    expect(unresolvedWordings(tours, foreign, FEES)).toHaveLength(1)
  })

  it('survives a tour with no days, and a day with nonsense in it', () => {
    expect(unresolvedWordings([{ template_name: 'Empty', itinerary: null }, tour('Odd', { attractions: [null, 7, '  '] })], [], FEES)).toEqual([])
  })

  it('most-used first, so the fix that prices the most tours is at the top', () => {
    const found = unresolvedWordings([tour('A', { attractions: ['Rare'] }, { attractions: ['Common'] }, { attractions: ['Common'] })], [], FEES)
    expect(found.map(f => f.wording)).toEqual(['Common', 'Rare'])
  })
})

describe('canonicalParts', () => {
  it('splits a combo and drops the blanks', () => {
    expect(canonicalParts(' Giza Plateau +  + Saqqara ')).toEqual(['Giza Plateau', 'Saqqara'])
  })
})

// ============================================================================
// The Settings screen is a CLIENT component, and the production build refused
// it the first time: it imported two helpers from alias-admin, which reaches
// the engine's alias loader → the query memo → node:async_hooks, and a browser
// bundle cannot hold that. `tsc` and the unit tests were all green; only
// `next build` noticed. CI does run a production build on every PR, so it
// would have gone red there — this test just says so a few minutes sooner,
// and says WHY, which a Turbopack chunking error does not.
// ============================================================================
describe('the screen only loads what a browser can hold', () => {
  const read = async (p: string) => (await import('node:fs')).readFileSync((await import('node:path')).join(process.cwd(), p), 'utf8')
  const imports = (src: string) => [...src.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1])

  it('alias-shared imports nothing at all', async () => {
    expect(imports(await read('lib/pricing/alias-shared.ts'))).toEqual([])
  })

  it('alias-admin-access imports nothing at all', async () => {
    expect(imports(await read('lib/pricing/alias-admin-access.ts'))).toEqual([])
  })

  it('the page takes its alias helpers from those two, never from the server-side module', async () => {
    const fromPricing = imports(await read('app/settings/attraction-aliases/page.tsx')).filter(i => i.startsWith('@/lib/pricing/'))
    expect(fromPricing.sort()).toEqual(['@/lib/pricing/alias-admin-access', '@/lib/pricing/alias-shared'])
  })
})
