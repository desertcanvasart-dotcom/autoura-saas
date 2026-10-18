// ============================================
// The package's voice in the grid parser's prompt
// ============================================
// Turns a package's includes (lib/package-types.ts) into explicit prompt
// rules for /api/pricing-grid/parse. Stated as OVERRIDES because the parse
// prompt's day templates describe the full-package shape ("arrival day:
// airport transfer + hotel check-in") — for a leaner product the AI must be
// told those lines do not apply. The route's deterministic scrub then
// GUARANTEES what this asks for.
//
// Pure on purpose: the route module builds a service-role client at import,
// so anything testable lives outside it (the lib/org-identity lesson).

import type { PackageTypeConfig } from '@/lib/package-types'

export function packageRules(pkg: PackageTypeConfig): string {
  // Stated as OVERRIDES because the day templates below describe the
  // full-package shape ("arrival day: airport transfer + hotel check-in") —
  // for a leaner product the AI must know those lines do not apply.
  const rules: string[] = [
    ``,
    `## PACKAGE TYPE: ${pkg.name.toUpperCase()} — ${pkg.description}`,
    `These package rules OVERRIDE the day templates below where they conflict:`,
  ]
  if (!pkg.includes.accommodation) {
    rules.push(
      `- NO accommodation: leave the "accommodation" and "cruise" slots EMPTY on every day. The client arranges their own hotels.`,
      `- NO hotel_services: leave "hotel_services" EMPTY on every day (no check-in/check-out porterage is sold).`
    )
  }
  if (!pkg.includes.airportTransfers) {
    rules.push(
      `- NO airport transfers: leave "airport_services" EMPTY, and do NOT add airport-transfer routes. The client reaches the meeting point themselves.`
    )
  }
  if (!pkg.includes.internalTransfers) {
    rules.push(`- NO internal transfers: leave intercity routes out.`)
  }
  if (!pkg.includes.overnightMoves) {
    rules.push(
      `- ONE base: every day starts and ends at the same place. No "intercity_dropoff" and no "intercity_overnight"; a visit to another city is an "intercity_day_trip" from the base.`
    )
  }
  if (pkg.includes.startPoint === 'port') {
    rules.push(
      `- SHORE EXCURSIONS: each day starts and ends at the cruise port or terminal (the day's city is the port city). Transport is from the port and back; no hotels, no airport transfers.`
    )
  }
  if (pkg.includes.cruise) {
    rules.push(
      `- CRUISE INCLUDED: the nights on board take the "cruise" slot (the ship the text names, else a cruise from the catalog on that route) and NO hotel on those nights; sightseeing on cruise days is the cruise's.`
    )
  }
  if (pkg.includes.meals === 'none') {
    rules.push(`- NO meals: leave the "meals" slot EMPTY.`)
  } else if (pkg.includes.meals === 'optional') {
    rules.push(`- Meals: add only the meals the text says are included.`)
  } else {
    rules.push(`- Meals: breakfast comes with the hotel or ship — never add it as a meal; add only the lunches and dinners the text says are included.`)
  }
  if (rules.length === 4) rules.push(`- Full package: the day templates below apply as written.`)
  return rules.join('\n')
}

