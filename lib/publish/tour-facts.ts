// ============================================
// Publish — a tour's facts, from the records, every render
// ============================================
// docs/publish/PLAN.md §8. Everything a tour page states as fact — days,
// what is included, where it sleeps, group size, departures, cancellation
// terms, prices — is read here from Autoura's own records and the pricing
// engine, at the moment the page is (re)built. Nothing is stored for the
// page; nothing is written for it.
//
// Prices follow the decisions of 2026-10-25 (Q4, Q4b, Q5):
//   · per person for 2 travellers sharing, plus a 2/4/6 table
//   · the agency's house margin (tenants.default_margin_percent; 25% only
//     where none is set) — the engine's own default would be a fixed 25%
//   · lowest season: no travel date, so the engine reads base rates
//   · EU and other-nationality prices when the rates make them differ
//   · an amount only from a tier the engine priced COMPLETELY (D7). A tour
//     with no complete tier is "price on request" — no number at all, not
//     even the flagged incomplete figure the internal tour cards show.
//
// assembleTourFacts() is pure (tested without a database or the engine);
// loadTourFacts() gathers its inputs.

import type { TourFacts } from './contract'
import { calculateMultiTierPricing, type PricingResult } from '@/lib/auto-pricing-service'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'
import { tierLadderForTenant, vocabularyLabelsForTenant } from '@/lib/vocabulary-server'
import { readDayMeals, type DayMeals } from '@/lib/tours/day-meals'
import { wordedAttractionsForDay } from '@/lib/tours/day-attractions'

export const PRICE_PAX = 2
export const TABLE_PAX = [2, 4, 6] as const
export const DEFAULT_MARGIN_PERCENT = 25
/** An exchange rate older than this is not shown, even as indicative. */
export const FX_MAX_AGE_DAYS = 7
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

// ---------- inputs ----------

export interface TemplateRow {
  id: string
  duration_days: number
  duration_nights: number | null
  image_url: string | null
  gallery_urls: string[] | null
  itinerary: unknown
  main_attractions: string[] | null
  highlights: string[] | null
  inclusions: string[] | null
  exclusions: string[] | null
  departure_days: string[] | null
  is_active: boolean | null
}

export interface VariationRow {
  tier: string
  min_pax: number | null
  max_pax: number | null
  inclusions: string[] | null
  exclusions: string[] | null
  is_active: boolean | null
}

export interface DepartureRow {
  start_date: string
  end_date: string | null
  status: string | null
  max_pax: number | null
  booked_pax: number | null
}

export interface PolicyRow {
  tiers: unknown
  wording: unknown
}

export interface FxRow {
  base_currency: string
  target_currency: string
  rate: number
  last_updated_at: string | null
}

/** One basis of the engine's answer: every tier, for one nationality. */
export type TierResults = Map<string, Pick<PricingResult, 'success' | 'complete' | 'pricePerPerson' | 'paxPricingTable' | 'services'>>

export interface FactsInput {
  language: string
  template: TemplateRow
  variations: VariationRow[]
  departures: DepartureRow[]
  policy: PolicyRow | null
  currency: string
  tierLabels: Map<string, string>
  /** isEurPassport = true / false */
  eu: TierResults
  other: TierResults
  indicativeCurrencies: string[]
  fx: FxRow[]
  today: Date
}

// ---------- helpers ----------

const texts = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()))] : []

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const round2 = (n: number) => Math.round(n * 100) / 100
const isProvided = (status: string) => status === 'included' || status === 'external'

/** A tier's per-person price on one basis — only when complete. */
function completePrice(results: TierResults, tier: string): number | null {
  const r = results.get(tier)
  return r && r.success && r.complete && usable(r.pricePerPerson) ? round2(r.pricePerPerson) : null
}

function tablePrice(results: TierResults, tier: string, pax: number): number | null {
  // The 2-traveller row IS the "from" figure: the engine's rate-sheet row can
  // differ from its headline price by a cent of rounding, and one page must
  // not state two prices for the same thing.
  if (pax === PRICE_PAX) return completePrice(results, tier)
  const r = results.get(tier)
  if (!r || !r.success || !r.complete) return null
  const row = r.paxPricingTable?.find(p => p.numPax === pax)
  return row && usable(row.withoutLeader.pricePerPerson) ? round2(row.withoutLeader.pricePerPerson) : null
}

function cancellationTiers(v: unknown): Array<{ daysBefore: number; chargePercent: number }> {
  if (!Array.isArray(v)) return []
  return v
    .filter((t): t is { days_before: number; charge_percent: number } =>
      !!t && typeof t === 'object' && Number.isInteger((t as never)['days_before']) && typeof (t as never)['charge_percent'] === 'number')
    .map(t => ({ daysBefore: t.days_before, chargePercent: t.charge_percent }))
    .sort((a, b) => b.daysBefore - a.daysBefore)
}

function indicative(input: FactsInput, perPerson: number): TourFacts['price']['indicative'] {
  const out: TourFacts['price']['indicative'] = []
  const cutoff = input.today.getTime() - FX_MAX_AGE_DAYS * 86400_000
  for (const target of input.indicativeCurrencies) {
    if (target === input.currency) continue
    const fresh = input.fx.filter(r => r.last_updated_at && Date.parse(r.last_updated_at) >= cutoff && usable(r.rate))
    const direct = fresh.find(r => r.base_currency === input.currency && r.target_currency === target)
    const inverse = fresh.find(r => r.base_currency === target && r.target_currency === input.currency)
    const rate = direct ? direct.rate : inverse ? 1 / inverse.rate : null
    const at = (direct ?? inverse)?.last_updated_at
    // No fresh rate: no conversion. Never the unconverted figure, never a guess.
    if (rate && at) out.push({ currency: target, perPerson: Math.round(perPerson * rate), rateDate: at.slice(0, 10) })
  }
  return out
}

// ---------- assembly ----------

export function assembleTourFacts(input: FactsInput): TourFacts {
  const t = input.template
  const activeVariations = input.variations.filter(v => v.is_active !== false)
  const rawDays = Array.isArray(t.itinerary) ? t.itinerary.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object') : []
  const days = rawDays.map((d, i) => {
    const meals = readDayMeals(d.meals as DayMeals | undefined)
    const city = typeof d.city === 'string' && d.city.trim() ? d.city.trim() : null
    return {
      day: Number(d.day) || i + 1,
      title: typeof d.title === 'string' && d.title.trim() ? d.title.trim() : null,
      city,
      // As the record says: a day that states no accommodation has no night,
      // and a one-day tour never has one (the operator's day-tour rule).
      overnight: rawDays.length > 1 && d.accommodation_type !== 'none',
      meals: { breakfast: isProvided(meals.breakfast), lunch: isProvided(meals.lunch), dinner: isProvided(meals.dinner) },
      sights: wordedAttractionsForDay(d, rawDays.length, t.main_attractions),
    }
  }).sort((a, b) => a.day - b.day)

  // ----- the price: the cheapest COMPLETE (tier, basis) is "from" -----
  let best: { tier: string; perPerson: number } | null = null
  for (const tier of new Set([...input.eu.keys(), ...input.other.keys()])) {
    for (const p of [completePrice(input.other, tier), completePrice(input.eu, tier)]) {
      if (p !== null && (!best || p < best.perPerson)) best = { tier, perPerson: p }
    }
  }

  let price: TourFacts['price']
  if (best) {
    const eu = completePrice(input.eu, best.tier)
    const other = completePrice(input.other, best.tier)
    const differs = eu !== null && other !== null && eu !== other
    price = {
      status: 'available',
      currency: input.currency,
      basis: { pax: PRICE_PAX, season: 'lowest' },
      from: { perPerson: best.perPerson, tier: best.tier, tierLabel: input.tierLabels.get(best.tier) ?? best.tier },
      byNationality: differs ? { eu: eu!, other: other! } : null,
      table: TABLE_PAX.map(pax => {
        const e = tablePrice(input.eu, best!.tier, pax)
        const o = tablePrice(input.other, best!.tier, pax)
        return differs
          ? { pax, perPerson: null, eu: e, other: o }
          : { pax, perPerson: o ?? e, eu: null, other: null }
      }).filter(r => r.perPerson !== null || r.eu !== null || r.other !== null),
      indicative: indicative(input, best.perPerson),
    }
  } else {
    price = { status: 'on_request', currency: input.currency, basis: { pax: PRICE_PAX, season: 'lowest' }, from: null, byNationality: null, table: [], indicative: [] }
  }

  // ----- what it includes, where it sleeps: the tier the price is for -----
  const tierVariation = best ? activeVariations.find(v => v.tier === best!.tier) : undefined
  const inclusions = texts([...(t.inclusions ?? []), ...(tierVariation?.inclusions ?? [])])
  const exclusions = texts([...(t.exclusions ?? []), ...(tierVariation?.exclusions ?? [])])
  const services = best ? (input.other.get(best.tier)?.services ?? input.eu.get(best.tier)?.services ?? []) : []
  const seen = new Set<string>()
  const accommodation = services.flatMap(s => {
    if (!s.property || s.unpriced) return []
    const key = `${s.property.kind}:${s.property.name}:${s.property.city ?? ''}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ kind: s.property.kind, name: s.property.name, city: s.property.city ?? null }]
  })

  const sizes = (tierVariation ? [tierVariation] : activeVariations)
  const mins = sizes.map(v => v.min_pax).filter((n): n is number => usable(n))
  const maxes = sizes.map(v => v.max_pax).filter((n): n is number => usable(n))
  const groupSize = mins.length || maxes.length ? { min: mins.length ? Math.min(...mins) : null, max: maxes.length ? Math.max(...maxes) : null } : null

  const todayIso = input.today.toISOString().slice(0, 10)
  const departures = input.departures
    .filter(d => d.start_date >= todayIso && ['open', 'guaranteed', 'full'].includes(d.status ?? ''))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 12)
    .map(d => ({
      date: d.start_date,
      endDate: d.end_date && d.end_date !== d.start_date ? d.end_date : null,
      status: d.status as 'open' | 'guaranteed' | 'full',
      seatsLeft: usable(d.max_pax) ? Math.max(0, d.max_pax - (d.booked_pax ?? 0)) : null,
    }))

  const policyTiers = input.policy ? cancellationTiers(input.policy.tiers) : []
  const wordingMap = input.policy?.wording && typeof input.policy.wording === 'object' ? input.policy.wording as Record<string, unknown> : {}
  const wording = typeof wordingMap[input.language] === 'string' && (wordingMap[input.language] as string).trim() ? (wordingMap[input.language] as string).trim() : null
  const cancellation = policyTiers.length || wording ? { tiers: policyTiers, wording } : null

  // ----- the thin-page rule (D7) -----
  const reasons: string[] = []
  if (days.length === 0) reasons.push('The tour has no days.')
  if (inclusions.length === 0) reasons.push('The tour lists nothing it includes.')
  if (price.status !== 'available') reasons.push('No tier of the tour has a complete price — every rate it needs must be entered.')
  if (t.is_active === false) reasons.push('The tour is switched off.')

  return {
    durationDays: Math.max(1, t.duration_days || days.length || 1),
    durationNights: Math.max(0, t.duration_nights ?? 0),
    images: texts([t.image_url, ...(t.gallery_urls ?? [])]).filter(u => /^https:\/\//.test(u)),
    days,
    mainAttractions: texts(t.main_attractions),
    highlights: texts(t.highlights),
    inclusions,
    exclusions,
    accommodation,
    groupSize,
    departureDays: WEEKDAYS.filter(w => (t.departure_days ?? []).includes(w)),
    departures,
    cancellation,
    price,
    publishable: { ok: reasons.length === 0, reasons },
  }
}

// ---------- gathering the inputs ----------

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

const TEMPLATE_COLUMNS = 'id, tenant_id, duration_days, duration_nights, image_url, gallery_urls, itinerary, main_attractions, highlights, inclusions, exclusions, departure_days, is_active, cancellation_policy_id'

/**
 * Everything assembleTourFacts needs, read for one tour. Throws when a read
 * fails: a page built on a half-read tour would state less than is true, so
 * it is better that the renderer keeps the page it already has.
 */
export async function loadTourFacts(db: Db, input: {
  tenantId: string
  templateId: string
  language: string
  indicativeCurrencies: string[]
  today?: Date
}): Promise<TourFacts> {
  const today = input.today ?? new Date()
  const check = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`reading ${what}: ${error.message}`)
  }

  const { data: template, error: tErr } = await db.from('tour_templates').select(TEMPLATE_COLUMNS)
    .eq('id', input.templateId).eq('tenant_id', input.tenantId).maybeSingle()
  check('the tour', tErr)
  if (!template) throw new Error('the tour does not exist for this company')

  const [variations, departures, tenant, policyRows] = await Promise.all([
    db.from('tour_variations').select('tier, min_pax, max_pax, inclusions, exclusions, is_active')
      .eq('template_id', input.templateId).eq('tenant_id', input.tenantId),
    db.from('tour_departures').select('start_date, end_date, status, max_pax, booked_pax')
      .eq('template_id', input.templateId).eq('tenant_id', input.tenantId).gte('start_date', today.toISOString().slice(0, 10)),
    db.from('tenants').select('default_margin_percent').eq('id', input.tenantId).maybeSingle(),
    db.from('cancellation_policies').select('id, is_default, tiers, wording').eq('tenant_id', input.tenantId),
  ])
  check('the variations', variations.error)
  check('the departures', departures.error)
  check('the company', tenant.error)
  check('the cancellation policies', policyRows.error)

  const policies = (policyRows.data ?? []) as Array<PolicyRow & { id: string; is_default: boolean }>
  const policy = policies.find(p => p.id === template.cancellation_policy_id) ?? policies.find(p => p.is_default) ?? null

  // null/absent is "not set" (25%), never 0%: Number(null) would be 0 and
  // publish every price at cost. A set 0% is a choice and is kept.
  const stored = tenant.data?.default_margin_percent
  const margin = stored === null || stored === undefined || stored === '' ? NaN : Number(stored)
  const marginPercent = Number.isFinite(margin) && margin >= 0 ? margin : DEFAULT_MARGIN_PERCENT

  const [currency, tiers, tierLabels] = await Promise.all([
    getTenantRunCurrency(db, input.tenantId),
    tierLadderForTenant(db as never, input.tenantId),
    vocabularyLabelsForTenant(db as never, input.tenantId, 'tier'),
  ])

  // The engine reads rates through the service role itself; no travel date
  // = lowest season. Two bases, every tier.
  const [eu, other] = await Promise.all([
    calculateMultiTierPricing(input.templateId, input.tenantId, tiers, PRICE_PAX, true, { marginPercent }),
    calculateMultiTierPricing(input.templateId, input.tenantId, tiers, PRICE_PAX, false, { marginPercent }),
  ])

  const wanted = input.indicativeCurrencies.filter(c => /^[A-Z]{3}$/.test(c) && c !== currency).slice(0, 3)
  let fx: FxRow[] = []
  if (wanted.length) {
    const { data, error } = await db.from('exchange_rates')
      .select('tenant_id, base_currency, target_currency, rate, last_updated_at')
      .in('base_currency', [currency, ...wanted]).in('target_currency', [currency, ...wanted])
      .eq('is_active', true)
    check('exchange rates', error)
    // The company's own rate wins over the shared one.
    fx = ((data ?? []) as Array<FxRow & { tenant_id: string | null }>)
      .filter(r => r.tenant_id === input.tenantId || r.tenant_id === null)
      .sort((a, b) => (a.tenant_id ? 0 : 1) - (b.tenant_id ? 0 : 1))
  }

  return assembleTourFacts({
    language: input.language,
    template,
    variations: (variations.data ?? []) as VariationRow[],
    departures: (departures.data ?? []) as DepartureRow[],
    policy,
    currency,
    tierLabels,
    eu: eu as TierResults,
    other: other as TierResults,
    indicativeCurrencies: wanted,
    fx,
    today,
  })
}
