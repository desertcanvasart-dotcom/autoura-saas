import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================
// The browse list must not re-ask per tier
// ============================================
// A guard, not a benchmark: it pins the wiring that took one tour card from 48
// database round trips to 30, and from 6.8s to 2.7s, measured against live
// data on 2026-09-18. The reads that remain are the ones that genuinely differ
// by tier — accommodation, meals, guides, tipping.

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')
const ENGINE = read('lib', 'auto-pricing-service.ts')

describe('calculateMultiTierPricing', () => {
  it('wraps every tier in ONE memo scope', () => {
    expect(ENGINE).toContain('return withQueryMemo(async () => {')
  })

  it('runs the tiers together — they do not depend on each other', () => {
    expect(ENGINE).toMatch(/tiers\.map\(async tier =>/)
    // The old shape: one tier at a time, each re-reading everything.
    expect(ENGINE).not.toMatch(/for \(const tier of tiers\) \{\s*const result = await calculateAutoPricing/)
  })
})

describe('the reads that do not change with the tier', () => {
  it('the programme is read once', () => {
    expect(ENGINE).toMatch(/memoRead\(\s*`template\|/)
  })

  it('the transport rows are read once', () => {
    expect(ENGINE).toMatch(/memoRead\(`transport\|\$\{scope\.tenantId\}`/)
  })

  it('an entrance fee is read once per fee, by id and by name', () => {
    expect(ENGINE).toMatch(/memoRead\(`fee-id\|/)
    expect(ENGINE).toMatch(/memoRead\(`fee-name\|/)
  })

  it('the alias index is read once', () => {
    expect(read('lib', 'pricing', 'attraction-aliases.ts')).toMatch(/memoRead\(`aliases\|\$\{tenantId\}`/)
  })
})

describe('every memo key names what changes the answer', () => {
  // A key that leaves out the passport or the tenant would hand one
  // customer's price to another — far worse than any number of round trips.
  it('the fee keys carry tenant and passport', () => {
    expect(ENGINE).toContain('`fee-id|${scope.tenantId}|${id}|${isEurPassport}`')
    expect(ENGINE).toContain('`fee-name|${scope.tenantId}|${attractionName.toLowerCase()}|${isEurPassport}`')
  })

  it('the transport and template keys carry their subject', () => {
    expect(ENGINE).toContain('`transport|${scope.tenantId}`')
    expect(ENGINE).toContain('`template|${templateId}`')
  })
})

describe('the shared TTL memos', () => {
  it('hold the in-flight read, so concurrent tiers do not stampede', () => {
    expect(ENGINE).toContain('ttlMemo<string[]>(VOCAB_TTL_MS)')
    expect(read('lib', 'fixed-costs.ts')).toContain('ttlMemo<FixedDailyCosts>(CACHE_TTL)')
  })
})
