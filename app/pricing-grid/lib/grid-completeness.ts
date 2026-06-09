// ============================================
// Pricing Grid — Completeness Gate (B-full)
// ============================================
// Pure, no side effects. Decides whether a grid is DELIVERABLE.
//
// Requirements derive from each day's COMPONENTS (overnight / sightseeing /
// airport arrival-departure / hotel check-in-out / intercity), which a day type
// preset fills but the operator can override — so combined days work (e.g. a
// domestic-flight transfer day that also sightsees).
//
// - Transport is TYPE-AWARE when route lines carry their service_type
//   (airport_transfer / day_tour / intercity_transfer); otherwise it degrades
//   to a count check.
// - Entrance fees are CLASS-AWARE: a `mandatory` fee must be priced; `optional`
//   and `free` never block, and a `free` line at €0 is expected (no warning).
//
// See PRICING-CONSOLIDATION-PLAN.md (Phase B) and the agreed model.

import type { GridDay, GridConfig, DayComponents, SlotValue, SlotSelection } from '../types'
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
}

const SLEEP_SLOTS = ['accommodation', 'cruise', 'sleeping_trains']
const TRANSPORT_SLOT = 'route'
const FLIGHTS_SLOT = 'flights'
const GUIDE_SLOT = 'guide'
const ENTRANCE_SLOT = 'entrance_fees'
const HOTEL_SERVICES_SLOT = 'hotel_services'
const AIRPORT_SERVICES_SLOT = 'airport_services'

// Transport segment service_types (must match the standardized rate vocabulary).
const SEG_AIRPORT = 'airport_transfer'
const SEG_DAY_TOUR = 'day_tour'
const SEG_INTERCITY = 'intercity_transfer'

const SEG_LABEL: Record<string, string> = {
  [SEG_AIRPORT]: 'airport transfer',
  [SEG_DAY_TOUR]: 'day-tour',
  [SEG_INTERCITY]: 'intercity transfer',
}

/** Explicit day flags override the day-type preset defaults. */
export function resolveComponents(day: GridDay): DayComponents {
  const base = DAY_TYPE_DEFAULTS[day.dayType ?? DEFAULT_DAY_TYPE]
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
function isPriced(s: SlotValue | undefined): boolean {
  return !!s && s.resolvedRate > 0
}
function sels(s: SlotValue | undefined): SlotSelection[] {
  return s?.selections ?? []
}

export function gridCompleteness(days: GridDay[], config: GridConfig): GridCompleteness {
  const issues: GridIssue[] = []

  if (days.length === 0) {
    issues.push({ dayNumber: null, severity: 'block', code: 'empty-grid', message: 'The itinerary has no days.' })
    return summarize(issues)
  }

  for (const day of days) {
    const c = resolveComponents(day)
    const dn = day.dayNumber

    // --- Sleep (every overnight day) ---
    if (c.overnight && !SLEEP_SLOTS.some((id) => isPriced(getSlot(day, id)))) {
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-sleep',
        message: `Day ${dn} is an overnight but has no accommodation, cruise, or sleeping train priced.`,
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
      const routeSel = sels(route)
      const typeAware = routeSel.some((s) => s.serviceType !== undefined)

      if (typeAware) {
        for (const seg of [SEG_AIRPORT, SEG_DAY_TOUR, SEG_INTERCITY]) {
          if (need[seg] === 0) continue
          const have = routeSel.filter((s) => s.serviceType === seg && s.rate > 0).length
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
        // Count-based fallback (route lines don't carry service_type yet).
        const priced =
          routeSel.length > 0
            ? routeSel.filter((s) => s.rate > 0).length
            : isPriced(route)
              ? Math.max(route!.selectedIds.length, 1)
              : 0
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
    if (c.intercity === 'flight' && !isPriced(getSlot(day, FLIGHTS_SLOT))) {
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-flight',
        message: `Day ${dn} is a flight transfer but no flight is priced.`,
      })
    }

    // --- Guide (sightseeing days, only when the Guide toggle is on) ---
    if (c.hasSightseeing && config.withGuide && !isPriced(getSlot(day, GUIDE_SLOT))) {
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-guide',
        message: `Day ${dn} is a sightseeing day but no guide is priced.`,
      })
    }

    // --- Entrance fees (class-aware): a selected MANDATORY fee must be priced ---
    for (const sel of sels(getSlot(day, ENTRANCE_SLOT))) {
      if (sel.pricingClass === 'mandatory' && !(sel.rate > 0)) {
        issues.push({
          dayNumber: dn,
          severity: 'block',
          code: 'unpriced-mandatory-entrance',
          message: `Day ${dn}: mandatory entrance "${sel.label ?? sel.id}" has no price.`,
        })
      }
    }

    // --- Hotel services (check-in / check-out events) ---
    if ((c.hotelCheckIn || c.hotelCheckOut) && !isPriced(getSlot(day, HOTEL_SERVICES_SLOT))) {
      const which = c.hotelCheckIn && c.hotelCheckOut ? 'check-in & check-out' : c.hotelCheckIn ? 'check-in' : 'check-out'
      issues.push({
        dayNumber: dn,
        severity: 'block',
        code: 'missing-hotel_services',
        message: `Day ${dn} has a hotel/cruise ${which} but no hotel services priced.`,
      })
    }

    // --- Airport services (arrival / departure events) ---
    if ((c.airportArrival || c.airportDeparture) && !isPriced(getSlot(day, AIRPORT_SERVICES_SLOT))) {
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
      const ext = s as SlotValue & { needsHumanInput?: boolean }
      // Unreviewed AI-suggested amount (Phase-3 fence) → block.
      if (ext.needsHumanInput) {
        issues.push({
          dayNumber: dn,
          severity: 'block',
          code: 'needs-human-input',
          message: `Day ${dn}: "${s.slotId}" has an AI-suggested amount that needs a manually-entered price.`,
        })
      }
      // A selection that priced to €0 → warn, UNLESS every selection is a known free item.
      const hasSel = s.selectedId !== null || s.selectedIds.length > 0 || (s.selections?.length ?? 0) > 0
      if (hasSel && s.resolvedRate === 0) {
        const allFree = (s.selections?.length ?? 0) > 0 && s.selections!.every((x) => x.pricingClass === 'free')
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
  const blocking = issues.filter((i) => i.severity === 'block').length
  return {
    complete: blocking === 0,
    blocking,
    warnings: issues.length - blocking,
    issues,
  }
}
