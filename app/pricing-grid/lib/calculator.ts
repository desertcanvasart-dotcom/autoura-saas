// ============================================
// PRICING GRID — Pure Calculation Engine
// No conditionals about day type. Just math.
// ============================================

import type {
  GridDay, GridConfig, SlotValue, SelectedItem, RateOption,
  DayCalc, GridTotals, PaxRangeResult, SLOT_DEFINITIONS,
} from '../types'
import { priceAcrossPax } from '@/lib/pricing/pax-range'

// --- Helpers ---

function getRate(item: { rateEur: number; rateNonEur: number }, passport: 'eu' | 'non_eu'): number {
  return passport === 'eu' ? item.rateEur : item.rateNonEur
}

function slotTotal(slot: SlotValue, passport: 'eu' | 'non_eu'): number {
  if (slot.customAmount > 0) return slot.customAmount
  return slot.selectedItems.reduce((sum, item) => sum + getRate(item, passport), 0)
}

// --- Per-Day Calculation ---

const GROUP_SLOT_IDS = new Set([
  'route', 'guide', 'airport_services', 'hotel_services',
  'tipping', 'boat_rides', 'other_group'
])

const PP_SLOT_IDS = new Set([
  'accommodation', 'entrance_fees', 'flights', 'experiences',
  'meals', 'water', 'cruise', 'other_pp'
])

export function calculateDay(day: GridDay, config: GridConfig): DayCalc {
  const { pax, passport } = config
  let groupTotal = 0
  let perPersonTotal = 0

  for (const slot of day.slots) {
    const cost = slotTotal(slot, passport)

    if (GROUP_SLOT_IDS.has(slot.slotId)) {
      // Group: guide slot respects the withGuide toggle
      if (slot.slotId === 'guide' && !config.withGuide) continue
      // Tipping: skip guide_tip if no guide
      if (slot.slotId === 'tipping' && !config.withGuide) {
        // Only include non-guide tips (driver_tip, etc.)
        const nonGuideTips = slot.selectedItems
          .filter(item => !item.rateId.includes('guide'))
          .reduce((sum, item) => sum + getRate(item, passport), 0)
        groupTotal += nonGuideTips
        continue
      }
      groupTotal += cost

    } else if (PP_SLOT_IDS.has(slot.slotId)) {
      if (slot.slotId === 'accommodation') {
        // Accommodation: pp_double_eur is already a per-person rate
        // For single pax, add single supplement on top
        if (slot.selectedItems.length > 0) {
          const ppDouble = getRate(slot.selectedItems[0], passport)
          const singleSupp = pax === 1 && slot.selectedItems.length > 1
            ? getRate(slot.selectedItems[1], passport)
            : 0
          perPersonTotal += ppDouble + (pax === 1 ? singleSupp : 0)
        }
      } else {
        perPersonTotal += cost
      }
    }
  }

  const groupPerPerson = pax > 0 ? groupTotal / pax : 0
  const dailyPerPerson = groupPerPerson + perPersonTotal
  const dailyTotal = dailyPerPerson * pax

  return {
    groupTotal: round2(groupTotal),
    perPersonTotal: round2(perPersonTotal),
    groupPerPerson: round2(groupPerPerson),
    dailyPerPerson: round2(dailyPerPerson),
    dailyTotal: round2(dailyTotal),
  }
}

// --- Grand Totals ---

export function calculateGrandTotals(
  days: GridDay[],
  config: GridConfig,
  opts?: {
    /** The throughout guide's extras (bed/meals/flight seats) as ONE group
     *  cost, from computeThroughoutGuideExtras (B-item 3). */
    throughoutGroupExtraEur?: number
  }
): GridTotals {
  const { pax, marginPercent } = config

  let costPerPerson = 0
  for (const day of days) {
    const calc = calculateDay(day, config)
    costPerPerson += calc.dailyPerPerson
  }
  // Throughout guide (B3): a group cost, divided across the paying guests.
  if (opts?.throughoutGroupExtraEur && pax > 0) {
    costPerPerson += opts.throughoutGroupExtraEur / pax
  }

  const totalCost = costPerPerson * pax
  // Clamp margin to reasonable range (0-200%)
  const safeMargin = Math.max(0, Math.min(isNaN(marginPercent) ? 0 : marginPercent, 200))
  const marginMultiplier = 1 + safeMargin / 100
  const sellingPricePerPerson = round2(costPerPerson * marginMultiplier)
  const sellingPriceTotal = round2(sellingPricePerPerson * pax)
  const marginAmount = round2(sellingPriceTotal - totalCost)

  return {
    costPerPerson: round2(costPerPerson),
    totalCost: round2(totalCost),
    marginAmount,
    sellingPricePerPerson,
    sellingPriceTotal,
  }
}

// ============================================
// MULTI-PAX RATE SHEET (B2B shape)
// ============================================
// The grid prices a single GridConfig.pax. The B2B rate sheet is the SAME trip
// priced across a pax range. The cost decomposes as:
//
//     totalCost(pax) = GroupFixed + Transport(pax) + PerPerson × pax
//
// where PerPerson (accommodation double-occupancy PPD, entrance, meals, water,
// cruise, flights) and GroupFixed (guide, tipping, airport/hotel services, boat
// rides) are pax-invariant, and Transport(pax) is the ONE non-linear term — the
// vehicle tier (Sedan→Minivan→Van→Minibus→Bus) is re-selected by group size.
// This mirrors auto-pricing-service's per-pax loop exactly; here the inputs are
// grid slots instead of derived day services. "One engine, two shapes."

const MARGIN_CAP = 200

/** One vehicle tier of a transport row: a capacity band and its rates. */
export interface TransportTier {
  capMin: number
  capMax: number
  rateEur: number
  rateNonEur: number
}

/**
 * Index of transport rowId → its vehicle tiers, built from the route rate
 * options the grid already fetched. The rates route encodes each option id as
 * `${rowId}__${tier}` (e.g. `abc__minivan`) and attaches capacity_min/max, so
 * a single transport SERVICE (the rowId) recovers all of its vehicle tiers.
 */
export type TransportTierIndex = Map<string, TransportTier[]>

export function buildTransportTierIndex(routeOptions: RateOption[]): TransportTierIndex {
  const index: TransportTierIndex = new Map()
  for (const opt of routeOptions) {
    const sep = opt.id.indexOf('__')
    if (sep === -1) continue // non-tiered (e.g. cruise transport package) — priced flat
    const rowId = opt.id.slice(0, sep)
    const tier: TransportTier = {
      capMin: opt.capacity_min ?? 1,
      capMax: opt.capacity_max ?? Number.MAX_SAFE_INTEGER,
      rateEur: opt.rateEur,
      rateNonEur: opt.rateNonEur,
    }
    const existing = index.get(rowId)
    if (existing) existing.push(tier)
    else index.set(rowId, [tier])
  }
  return index
}

/**
 * Rate for one transport selection at a given pax count. A tier-encoded
 * selection (`rowId__tier`) is RE-RESOLVED to the vehicle whose capacity band
 * covers `pax` (falling back to the largest tier when the group exceeds every
 * band) — the stored tier's rate is ignored. A non-tiered selection (cruise
 * package, custom) is treated as a flat group cost at its stored rate.
 */
function resolveTransportRate(
  item: SelectedItem,
  pax: number,
  passport: 'eu' | 'non_eu',
  tierIndex: TransportTierIndex,
): number {
  const sep = item.rateId.indexOf('__')
  const tiers = sep === -1 ? undefined : tierIndex.get(item.rateId.slice(0, sep))
  if (!tiers || tiers.length === 0) {
    return passport === 'eu' ? item.rateEur : item.rateNonEur
  }
  const sorted = [...tiers].sort((a, b) => a.capMin - b.capMin)
  const match = sorted.find(t => pax >= t.capMin && pax <= t.capMax) ?? sorted[sorted.length - 1]
  return passport === 'eu' ? match.rateEur : match.rateNonEur
}

/**
 * Pax-invariant aggregates: group costs (excluding transport) and per-person
 * costs, plus the whole-tour single supplement. Computed once; reused at every
 * pax count. Mirrors calculateDay's group/per-person rules (withGuide toggle,
 * tipping guide-exclusion, accommodation double-occupancy PPD).
 */
function aggregateNonTransport(days: GridDay[], config: GridConfig) {
  const { passport, withGuide } = config
  let groupFixed = 0
  let perPerson = 0
  let singleSupplement = 0

  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.slotId === 'route') continue // transport is pax-dependent — handled separately

      if (GROUP_SLOT_IDS.has(slot.slotId)) {
        if (slot.slotId === 'guide' && !withGuide) continue
        if (slot.slotId === 'tipping' && !withGuide) {
          groupFixed += slot.selectedItems
            .filter(item => !item.rateId.includes('guide'))
            .reduce((sum, item) => sum + getRate(item, passport), 0)
          continue
        }
        groupFixed += slotTotal(slot, passport)

      } else if (PP_SLOT_IDS.has(slot.slotId)) {
        if (slot.slotId === 'accommodation') {
          if (slot.selectedItems.length > 0) {
            // First item = double-occupancy per-person rate; any further items
            // are single-supplement add-ons (see SlotRow's `${id}_supp`).
            perPerson += getRate(slot.selectedItems[0], passport)
            for (let k = 1; k < slot.selectedItems.length; k++) {
              singleSupplement += getRate(slot.selectedItems[k], passport)
            }
          } else if (slot.customAmount > 0) {
            perPerson += slot.customAmount
          }
        } else {
          perPerson += slotTotal(slot, passport)
        }
      }
    }
  }

  return { groupFixed, perPerson, singleSupplement }
}

/** Whole-tour transport cost at a given pax count (vehicle re-selected per pax). */
function transportForPax(
  days: GridDay[],
  config: GridConfig,
  pax: number,
  tierIndex: TransportTierIndex,
): number {
  const { passport } = config
  let total = 0
  for (const day of days) {
    const slot = day.slots.find(s => s.slotId === 'route')
    if (!slot) continue
    if (slot.customAmount > 0) {
      total += slot.customAmount // flat custom transport — pax-invariant
      continue
    }
    for (const item of slot.selectedItems) {
      total += resolveTransportRate(item, pax, passport, tierIndex)
    }
  }
  return total
}

/**
 * Price the trip across a pax range — the B2B rate sheet, produced from the
 * same grid slots that drive the single-quote (B2C) shape.
 *
 * @param tierIndex Built from the grid's already-fetched route rate options via
 *   buildTransportTierIndex(allRates.route).
 */
export function calculatePaxRange(
  days: GridDay[],
  config: GridConfig,
  tierIndex: TransportTierIndex,
  opts?: {
    paxFrom?: number
    paxTo?: number
    /** Throughout guide (B-item 3): his extras join the group-fixed costs
     *  (the sheet keeps the meal lines at every count — the documented
     *  approximation), and every vehicle sizes at pax+1 — stacking with
     *  the tour leader row's own +1. */
    throughoutGroupExtraEur?: number
    throughoutExtraSeats?: number
  },
): PaxRangeResult {
  const safeMargin = Math.max(0, Math.min(isNaN(config.marginPercent) ? 0 : config.marginPercent, MARGIN_CAP))
  const { groupFixed, perPerson, singleSupplement } = aggregateNonTransport(days, config)
  const extraSeats = opts?.throughoutExtraSeats ?? 0

  // The per-pax math is the shared core primitive — the grid only supplies the
  // shape-specific bits: aggregates, a tier-index transport resolver, and the
  // leader-cost policy (leader takes a single room + their own per-person costs).
  const paxPricing = priceAcrossPax({
    groupFixed: groupFixed + (opts?.throughoutGroupExtraEur ?? 0),
    perPerson,
    marginPercent: safeMargin,
    transportAt: (pax) => transportForPax(days, config, pax + extraSeats, tierIndex),
    tourLeaderCost: perPerson + singleSupplement,
    paxFrom: opts?.paxFrom,
    paxTo: opts?.paxTo,
  })

  return {
    paxPricing,
    singleSupplement: round2(singleSupplement),
    currency: config.currency,
  }
}

// --- Currency Conversion ---

export function convertAmount(eurAmount: number, exchangeRate: number | null): number {
  if (!exchangeRate) return eurAmount
  return round2(eurAmount * exchangeRate)
}

// --- Utility ---

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// --- Create empty slot values for a new day ---

export function createEmptySlots(): SlotValue[] {
  const { SLOT_DEFINITIONS } = require('../types')
  return SLOT_DEFINITIONS.map((def: typeof SLOT_DEFINITIONS[number]) => ({
    slotId: def.slotId,
    selectedItems: [],
    customAmount: 0,
  }))
}
