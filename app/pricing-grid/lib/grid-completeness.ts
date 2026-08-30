// ============================================
// Pricing Grid — Completeness Gate (consolidation Phase B rich)
// ============================================
// Pure, no side effects. Decides whether a grid is DELIVERABLE.
//
// Requirements derive from each day's COMPONENTS (overnight / sightseeing /
// airport arrival-departure / hotel check-in-out / intercity), which a
// day_type preset fills but the operator can override per-day — so
// combined days work (e.g. a transfer day that also sightsees).
//
// - Transport is TYPE-AWARE when route selectedItems carry their
//   service_type (airport_transfer / day_tour / intercity_transfer);
//   otherwise it degrades to a count check.
// - Entrance fees are CLASS-AWARE when selectedItems carry pricing_class:
//   a `mandatory` fee must be priced; `optional` and `free` never block.
//   Selections without a class fall through to a structural priced/unpriced
//   check.
// - "Priced" for a slot means: at least one selectedItem with a non-zero
//   rate (either passport variant) OR a non-zero customAmount.
//
// Ported from the sibling app (autoura-saas) and adapted to our
// SelectedItem shape. See docs/PRICING-CONSOLIDATION-PLAN.md (Phase B) and the
// migration 20260627_itinerary_days_day_type_components.sql.

import { PACKAGE_TYPE_CONFIGS, type PackageType } from '@/lib/package-types'
import type {
  GridDay,
  GridConfig,
  DayComponents,
  SlotValue,
  SelectedItem,
} from '../types'
import { DAY_TYPE_DEFAULTS, DEFAULT_DAY_TYPE } from '../types'

export type IssueSeverity = 'block' | 'warn'

export interface GridIssue {
  dayNumber: number | null // null = grid-level
  severity: IssueSeverity
  code: string
  message: string
}

export interface GridCompleteness {
  /** true ⇔ no 'block' issues — safe to turn into a deliverable quote. */
  complete: boolean
  blocking: number
  warnings: number
  issues: GridIssue[]

  // The save route used to consume the lite gate's { ok, blocking[],
  // warnings[] } shape. These are derived for backwards compatibility so
  // existing consumers keep working without each one being rewritten.
  ok: boolean
  blockingMessages: string[]
  warningMessages: string[]
}

const SLEEP_SLOTS = ['accommodation', 'cruise']
const TRANSPORT_SLOT = 'route'
const FLIGHTS_SLOT = 'flights'
const GUIDE_SLOT = 'guide'
const ENTRANCE_SLOT = 'entrance_fees'
const HOTEL_SERVICES_SLOT = 'hotel_services'
const AIRPORT_SERVICES_SLOT = 'airport_services'

// Transport segment service_types (must match the standardized rate
// vocabulary used by /api/pricing-grid/rates and transportation_rates).
const SEG_AIRPORT = 'airport_transfer'
const SEG_DAY_TOUR = 'day_tour'
const SEG_INTERCITY = 'intercity_transfer'

const SEG_LABEL: Record<string, string> = {
  [SEG_AIRPORT]: 'airport transfer',
  [SEG_DAY_TOUR]: 'day-tour',
  [SEG_INTERCITY]: 'intercity transfer',
}

/** Explicit day flags override the day-type preset defaults. */
/**
 * What the PACKAGE removes from a day's default requirements.
 *
 * The presets in DAY_TYPE_DEFAULTS describe a FULL PACKAGE day ('arrival'
 * means airport pickup + hotel check-in), and until this mask existed the
 * gate enforced them for every product: a tours-only trip — no hotels, no
 * airport transfers sold — was BLOCKED for having no accommodation priced
 * on days the customer sleeps in a hotel we did not sell them. The mask
 * turns a package's includes (lib/package-types.ts) into "this component is
 * not part of the product, so its preset default is off".
 *
 * PRECEDENCE: preset default → package mask → the operator's explicit
 * per-day flag. The override wins over the mask on purpose: "this
 * tours-only trip does include one airport pickup, we agreed it specially"
 * is a real sale, and the operator saying so beats the product definition.
 */
function packageMask(packageType: PackageType | undefined): Partial<DayComponents> {
  const cfg = PACKAGE_TYPE_CONFIGS.find(p => p.slug === (packageType ?? 'full-package'))
  if (!cfg) return {}
  const mask: Partial<DayComponents> = {}
  if (!cfg.includes.accommodation) {
    mask.overnight = false
    // No accommodation sold → no hotel check-in/out services to price either.
    mask.hotelCheckIn = false
    mask.hotelCheckOut = false
  }
  if (!cfg.includes.airportTransfers) {
    mask.airportArrival = false
    mask.airportDeparture = false
  }
  if (!cfg.includes.internalTransfers) {
    mask.intercity = 'none'
  }
  return mask
}

/** Preset defaults, masked by the package, overridden by explicit day flags. */
export function resolveComponents(day: GridDay, packageType?: PackageType): DayComponents {
  const base = { ...DAY_TYPE_DEFAULTS[day.dayType ?? DEFAULT_DAY_TYPE], ...packageMask(packageType) }
  return {
    overnight: day.overnight ?? base.overnight,
    hasSightseeing: day.hasSightseeing ?? base.hasSightseeing,
    airportArrival: day.airportArrival ?? base.airportArrival,
    airportDeparture: day.airportDeparture ?? base.airportDeparture,
    hotelCheckIn: day.hotelCheckIn ?? base.hotelCheckIn,
    hotelCheckOut: day.hotelCheckOut ?? base.hotelCheckOut,
    intercity: day.intercity ?? base.intercity,
  }
}

function getSlot(day: GridDay, id: string): SlotValue | undefined {
  return day.slots.find((s) => s.slotId === id)
}

/** A selectedItem is priced if either passport variant is > 0. */
function itemIsPriced(item: SelectedItem): boolean {
  return (item.rateEur > 0) || (item.rateNonEur > 0)
}

/** A slot is priced when at least one selectedItem or customAmount has value. */
function slotIsPriced(s: SlotValue | undefined): boolean {
  if (!s) return false
  if ((s.customAmount ?? 0) > 0) return true
  return (s.selectedItems ?? []).some(itemIsPriced)
}

function items(s: SlotValue | undefined): SelectedItem[] {
  return s?.selectedItems ?? []
}

export function gridCompleteness(
  days: GridDay[] | any[],
  config: Partial<GridConfig> | any
): GridCompleteness {
  const issues: GridIssue[] = []
  const dayList: GridDay[] = Array.isArray(days) ? days : []

  if (dayList.length === 0) {
    issues.push({ dayNumber: null, severity: 'block', code: 'empty-grid', message: 'The itinerary has no days.' })
    return summarize(issues)
  }

  for (const day of dayList) {
    const c = resolveComponents(day, config?.packageType)
    const dn = day.dayNumber

    // --- Sleep (every overnight day) ---
    if (c.overnight && !SLEEP_SLOTS.some((id) => slotIsPriced(getSlot(day, id)))) {
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-sleep',
        message: `Day ${dn} is an overnight but has no accommodation or cruise priced.`,
      })
    }

    // --- Transport segments ---
    const need: Record<string, number> = {
      [SEG_AIRPORT]: (c.airportArrival ? 1 : 0) + (c.airportDeparture ? 1 : 0),
      [SEG_DAY_TOUR]: c.hasSightseeing ? 1 : 0,
      [SEG_INTERCITY]: c.intercity === 'road' ? 1 : 0,
    }
    const totalNeed = need[SEG_AIRPORT] + need[SEG_DAY_TOUR] + need[SEG_INTERCITY]
    if (totalNeed > 0) {
      const route = getSlot(day, TRANSPORT_SLOT)
      const routeItems = items(route)
      const typeAware = routeItems.some((s) => s.serviceType !== undefined)

      if (typeAware) {
        for (const seg of [SEG_AIRPORT, SEG_DAY_TOUR, SEG_INTERCITY]) {
          if (need[seg] === 0) continue
          const have = routeItems.filter((s) => s.serviceType === seg && itemIsPriced(s)).length
          if (have < need[seg]) {
            issues.push({
              dayNumber: dn,
              severity: 'block',
              code: `missing-transport-${seg}`,
              message: `Day ${dn} needs ${need[seg]} ${SEG_LABEL[seg]} segment(s) but ${have} priced.`,
            })
          }
        }
      } else {
        // Count-based fallback: route lines don't carry service_type yet
        // (legacy itinerary loaded before the rates route attached it).
        const priced = routeItems.filter(itemIsPriced).length + ((route?.customAmount ?? 0) > 0 ? 1 : 0)
        if (priced < totalNeed) {
          const want = Object.entries(need)
            .filter(([, n]) => n > 0)
            .map(([seg, n]) => `${n}× ${SEG_LABEL[seg]}`)
            .join(', ')
          issues.push({
            dayNumber: dn,
            severity: 'block',
            code: 'missing-transport',
            message: `Day ${dn} needs ${totalNeed} transport segment(s) (${want}) but ${priced} priced.`,
          })
        }
      }
    }

    // --- Flight (intercity by air) ---
    if (c.intercity === 'flight' && !slotIsPriced(getSlot(day, FLIGHTS_SLOT))) {
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-flight',
        message: `Day ${dn} is a flight transfer but no flight is priced.`,
      })
    }

    // --- Guide (sightseeing days, only when the Guide toggle is on) ---
    if (c.hasSightseeing && config?.withGuide && !slotIsPriced(getSlot(day, GUIDE_SLOT))) {
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-guide',
        message: `Day ${dn} is a sightseeing day but no guide is priced.`,
      })
    }

    // --- Entrance fees (class-aware): a selected MANDATORY fee must be priced ---
    for (const sel of items(getSlot(day, ENTRANCE_SLOT))) {
      if (sel.pricingClass === 'mandatory' && !itemIsPriced(sel)) {
        issues.push({
          dayNumber: dn,
          severity: 'block',
          code: 'unpriced-mandatory-entrance',
          message: `Day ${dn}: mandatory entrance "${sel.name}" has no price.`,
        })
      }
    }

    // --- Hotel services (check-in / check-out events) ---
    if ((c.hotelCheckIn || c.hotelCheckOut) && !slotIsPriced(getSlot(day, HOTEL_SERVICES_SLOT))) {
      const which = c.hotelCheckIn && c.hotelCheckOut ? 'check-in & check-out' : c.hotelCheckIn ? 'check-in' : 'check-out'
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-hotel_services',
        message: `Day ${dn} has a hotel ${which} but no hotel services priced.`,
      })
    }

    // --- Airport services (arrival / departure events) ---
    if ((c.airportArrival || c.airportDeparture) && !slotIsPriced(getSlot(day, AIRPORT_SERVICES_SLOT))) {
      const which = c.airportArrival && c.airportDeparture ? 'arrival & departure' : c.airportArrival ? 'arrival' : 'departure'
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-airport_services',
        message: `Day ${dn} has an airport ${which} but no airport services priced.`,
      })
    }

    // --- Cross-cutting per slot ---
    for (const s of day.slots) {
      // A selection that priced to €0 → warn, UNLESS every selection is
      // a known free item.
      const hasSel = (s.selectedItems?.length ?? 0) > 0
      if (hasSel && !slotIsPriced(s)) {
        const allFree = s.selectedItems!.every((x) => x.pricingClass === 'free')
        if (!allFree) {
          issues.push({
            dayNumber: dn,
            severity: 'warn',
            code: 'zero-resolved-selection',
            message: `Day ${dn}: "${s.slotId}" has a selection that priced to €0 — confirm it is intentionally free.`,
          })
        }
      }
    }
  }

  return summarize(issues)
}

function summarize(issues: GridIssue[]): GridCompleteness {
  const blockingIssues = issues.filter((i) => i.severity === 'block')
  const warningIssues = issues.filter((i) => i.severity === 'warn')
  return {
    complete: blockingIssues.length === 0,
    blocking: blockingIssues.length,
    warnings: warningIssues.length,
    issues,
    // Back-compat fields the prior save route consumed.
    ok: blockingIssues.length === 0,
    blockingMessages: blockingIssues.map((i) => i.message),
    warningMessages: warningIssues.map((i) => i.message),
  }
}
