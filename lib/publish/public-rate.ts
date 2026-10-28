// ============================================
// Publish — one public rate per tour (operator brief, 2026-10-28)
// ============================================
// A tour has exactly ONE public price. Nationality rates (EU / other) live
// only inside the pricing engine, as inputs for hotel and cruise costs; the
// public website never shows, asks for, or receives them.
//
// How the public rate is made (decisions of 2026-10-28):
//   · the engine prices every traveller count in the tour's group size, on
//     both bases, at the agency's house margin, lowest season;
//   · each count takes the HIGHER of the two figures, so no visitor is ever
//     sold below the real cost;
//   · one tier: the cheapest whose every count resolves (fewest gaps when
//     none does, so the manager sees what is missing);
//   · a count that does not resolve is a GAP and blocks approval: the page
//     never guesses a price for it;
//   · a manager approves the proposal; the approved bands are the public
//     rate until a newer proposal is approved. When the engine's answer
//     moves, the admin says so — the website keeps the approved rate.
//
// Everything here is pure; loadRateProposal() gathers the engine's answer.

import { z } from 'zod'
import { calculateMultiTierPricing, type PricingResult } from '@/lib/auto-pricing-service'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'
import { tierLadderForTenant, vocabularyLabelsForTenant } from '@/lib/vocabulary-server'
import { DEFAULT_MARGIN_PERCENT } from '@/lib/ai/parsing-utils'

/** The engine prices headline figures for this many travellers sharing. */
export const HEADLINE_PAX = 2
/** The engine's per-traveller table runs 1..40 (auto-pricing-service PAX_COUNTS). */
export const MAX_PUBLIC_PAX = 40

export type TierResults = Map<string, Pick<PricingResult, 'success' | 'complete' | 'pricePerPerson' | 'paxPricingTable' | 'services'>>

const money = z.number().positive().finite()
export const bandSchema = z.object({
  minPax: z.number().int().positive(),
  maxPax: z.number().int().positive(),
  perPerson: money,
})
export type Band = z.infer<typeof bandSchema>

/** What publish_pages.public_rate holds: the approved public rate. */
export const savedRateSchema = z.object({
  tier: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  bands: z.array(bandSchema).min(1),
}).refine(r => bandsAreContiguous(r.bands), 'bands must run without gaps or overlaps')
export type SavedRate = z.infer<typeof savedRateSchema>

/** A stored rate as the code may use it — or null when absent or malformed. */
export function readSavedRate(v: unknown): SavedRate | null {
  const r = savedRateSchema.safeParse(v)
  return r.success ? r.data : null
}

// ---------- bands ----------

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const round2 = (n: number) => Math.round(n * 100) / 100

export function bandsAreContiguous(bands: Band[]): boolean {
  return bands.every((b, i) => b.minPax <= b.maxPax && (i === 0 || b.minPax === bands[i - 1].maxPax + 1))
}

/** Consecutive counts at the same price become one band. Every count must have a price. */
export function bandsOf(perPax: Array<{ pax: number; perPerson: number }>): Band[] {
  const out: Band[] = []
  for (const { pax, perPerson } of [...perPax].sort((a, b) => a.pax - b.pax)) {
    const last = out[out.length - 1]
    if (last && last.maxPax + 1 === pax && last.perPerson === perPerson) last.maxPax = pax
    else out.push({ minPax: pax, maxPax: pax, perPerson })
  }
  return out
}

/** The per-person price for a traveller count, or null outside the bands. */
export function priceFor(bands: Band[], pax: number): number | null {
  return bands.find(b => pax >= b.minPax && pax <= b.maxPax)?.perPerson ?? null
}

/** The lowest per-person price across the bands: "From X per person". */
export function fromPriceOf(bands: Band[]): number | null {
  return bands.length ? Math.min(...bands.map(b => b.perPerson)) : null
}

export function sameBands(a: Band[], b: Band[]): boolean {
  return a.length === b.length && a.every((x, i) => x.minPax === b[i].minPax && x.maxPax === b[i].maxPax && x.perPerson === b[i].perPerson)
}

// ---------- the proposal ----------

/** One basis's per-person price for a count — only from a complete tier. */
function basisPrice(results: TierResults, tier: string, pax: number): number | null {
  const r = results.get(tier)
  if (!r || !r.success || !r.complete) return null
  // The 2-traveller figure IS the headline: the rate-sheet row can differ from
  // it by a cent of rounding, and one page must not state two prices.
  if (pax === HEADLINE_PAX) return usable(r.pricePerPerson) ? round2(r.pricePerPerson) : null
  const row = r.paxPricingTable?.find(p => p.numPax === pax)
  return row && usable(row.withoutLeader.pricePerPerson) ? round2(row.withoutLeader.pricePerPerson) : null
}

export interface GroupSize { tier: string; min: number | null; max: number | null }

export interface RateProposal {
  currency: string
  tier: string | null
  tierLabel: string | null
  range: { min: number; max: number } | null
  bands: Band[]
  /** Traveller counts in the range with no price on one basis or both. */
  missing: number[]
  /** Why it cannot be approved; empty when it can. */
  reasons: string[]
}

/** The tier's own group size, else the tour's widest. */
function rangeFor(tier: string, sizes: GroupSize[]): { min: number; max: number } | null {
  const own = sizes.filter(s => s.tier === tier)
  const pick = own.length ? own : sizes
  const mins = pick.map(s => s.min).filter(usable)
  const maxes = pick.map(s => s.max).filter(usable)
  if (!mins.length || !maxes.length) return null
  const min = Math.min(...mins)
  const max = Math.max(...maxes)
  return min <= max ? { min, max } : null
}

export function proposePublicRate(input: {
  currency: string
  /** Tiers in the company's order (cheapest-first is not assumed). */
  tiers: string[]
  tierLabels: Map<string, string>
  groupSizes: GroupSize[]
  eu: TierResults
  other: TierResults
}): RateProposal {
  type Candidate = { tier: string; range: { min: number; max: number }; perPax: Array<{ pax: number; perPerson: number }>; missing: number[] }
  const candidates: Candidate[] = []
  for (const tier of input.tiers) {
    if (!input.eu.has(tier) && !input.other.has(tier)) continue
    const range = rangeFor(tier, input.groupSizes)
    if (!range) continue
    const perPax: Candidate['perPax'] = []
    const missing: number[] = []
    for (let pax = range.min; pax <= range.max; pax++) {
      const eu = pax <= MAX_PUBLIC_PAX ? basisPrice(input.eu, tier, pax) : null
      const other = pax <= MAX_PUBLIC_PAX ? basisPrice(input.other, tier, pax) : null
      // Both bases must answer: the higher of two is unknowable from one.
      if (eu === null || other === null) missing.push(pax)
      else perPax.push({ pax, perPerson: Math.max(eu, other) })
    }
    candidates.push({ tier, range, perPax, missing })
  }

  const empty = (reasons: string[]): RateProposal =>
    ({ currency: input.currency, tier: null, tierLabel: null, range: null, bands: [], missing: [], reasons })
  if (!input.groupSizes.some(s => usable(s.min) && usable(s.max))) {
    return empty(['Set the tour’s group size — the fewest and the most travellers — so every count can be priced.'])
  }
  if (!candidates.length) return empty(['No tier of the tour could be priced — every rate it needs must be entered.'])

  const head = (c: Candidate) => c.perPax[0]?.perPerson ?? Infinity
  const best = candidates.reduce((a, b) => {
    if (a.missing.length !== b.missing.length) return a.missing.length < b.missing.length ? a : b
    return head(b) < head(a) ? b : a
  })

  const reasons: string[] = []
  if (best.range.max > MAX_PUBLIC_PAX) reasons.push(`Prices go up to ${MAX_PUBLIC_PAX} travellers; the tour allows ${best.range.max}.`)
  const unpriced = best.missing.filter(n => n <= MAX_PUBLIC_PAX)
  if (unpriced.length) reasons.push(`No price for ${listCounts(unpriced)} — enter the rates these group sizes need.`)
  return {
    currency: input.currency,
    tier: best.tier,
    tierLabel: input.tierLabels.get(best.tier) ?? best.tier,
    range: best.range,
    bands: best.missing.length ? [] : bandsOf(best.perPax),
    missing: best.missing,
    reasons,
  }
}

/** "2, 3 and 7–9 travellers" */
export function listCounts(counts: number[]): string {
  const runs = bandsOf(counts.map(pax => ({ pax, perPerson: 1 }))).map(b => b.minPax === b.maxPax ? `${b.minPax}` : `${b.minPax}–${b.maxPax}`)
  const words = runs.length > 1 ? `${runs.slice(0, -1).join(', ')} and ${runs[runs.length - 1]}` : runs[0] ?? ''
  return `${words} traveller${counts.length === 1 && counts[0] === 1 ? '' : 's'}`
}

/** Where the approved rate stands against today's proposal. */
export type RateStatus = 'none' | 'in_step' | 'changed'
export function rateStatus(saved: SavedRate | null, proposal: RateProposal): RateStatus {
  if (!saved) return 'none'
  return proposal.tier === saved.tier && proposal.currency === saved.currency && sameBands(proposal.bands, saved.bands) ? 'in_step' : 'changed'
}

// ---------- gathering the engine's answer ----------

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export interface EngineRuns {
  currency: string
  tiers: string[]
  tierLabels: Map<string, string>
  eu: TierResults
  other: TierResults
}

/** The engine's answer for a tour: every tier, both bases, house margin, lowest season. */
export async function runEngine(db: Db, tenantId: string, templateId: string): Promise<EngineRuns> {
  const { data: tenant, error } = await db.from('tenants').select('default_margin_percent').eq('id', tenantId).maybeSingle()
  if (error) throw new Error(`reading the company: ${error.message}`)
  // null/absent is "not set" (25%), never 0%: Number(null) would be 0 and
  // publish every price at cost. A set 0% is a choice and is kept.
  const stored = tenant?.default_margin_percent
  const margin = stored === null || stored === undefined || stored === '' ? NaN : Number(stored)
  const marginPercent = Number.isFinite(margin) && margin >= 0 ? margin : DEFAULT_MARGIN_PERCENT

  const [currency, tiers, tierLabels] = await Promise.all([
    getTenantRunCurrency(db, tenantId),
    tierLadderForTenant(db as never, tenantId),
    vocabularyLabelsForTenant(db as never, tenantId, 'tier'),
  ])
  // The engine reads rates through the service role itself; no travel date
  // = lowest season.
  const [eu, other] = await Promise.all([
    calculateMultiTierPricing(templateId, tenantId, tiers, HEADLINE_PAX, true, { marginPercent }),
    calculateMultiTierPricing(templateId, tenantId, tiers, HEADLINE_PAX, false, { marginPercent }),
  ])
  return { currency, tiers, tierLabels, eu: eu as TierResults, other: other as TierResults }
}

/** Today's proposal for a tour's public rate. */
export async function loadRateProposal(db: Db, tenantId: string, templateId: string): Promise<RateProposal> {
  const { data, error } = await db.from('tour_variations').select('tier, min_pax, max_pax, is_active')
    .eq('template_id', templateId).eq('tenant_id', tenantId)
  if (error) throw new Error(`reading the variations: ${error.message}`)
  const groupSizes = ((data ?? []) as Array<{ tier: string; min_pax: number | null; max_pax: number | null; is_active: boolean | null }>)
    .filter(v => v.is_active !== false).map(v => ({ tier: v.tier, min: v.min_pax, max: v.max_pax }))
  const runs = await runEngine(db, tenantId, templateId)
  return proposePublicRate({ ...runs, groupSizes })
}
