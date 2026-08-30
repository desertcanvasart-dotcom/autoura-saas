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
  if (pkg.includes.meals === 'none') {
    rules.push(`- NO meals: leave the "meals" slot EMPTY.`)
  }
  if (rules.length === 3) rules.push(`- Full package: the day templates below apply as written.`)
  return rules.join('\n')
}

