// Rate-coverage report for the pricing harness (Layer 4).
//
// Runs the strict engine across templates × tiers and aggregates the
// PricingHoles, so an operator can see every rate-data gap BEFORE a customer
// hits it — turning "incomplete quote" into a concrete to-do list.
//
// The engine call is injected (`calc`) so this stays pure and unit-testable.
// See PRICING-HARNESS-PLAN.md.

import type { ServiceTier, DayPricingResult } from './auto-pricing-service'
import type { PricingHole } from './pricing-types'

export interface CoverageRow {
  templateId: string
  templateName: string
  tier: ServiceTier
  complete: boolean
  holeCount: number
  holes: PricingHole[]
}

export interface CoverageReport {
  summary: {
    checked: number
    complete: number
    incomplete: number
    totalHoles: number
    /** Hole counts grouped by kind (hotel, transport, entrance, …). */
    holesByKind: Record<string, number>
  }
  rows: CoverageRow[]
}

/** The slice of the engine result the coverage report consumes. */
export type CoverageCalcResult = Pick<
  DayPricingResult,
  'success' | 'complete' | 'holes' | 'templateName'
>

export type CoverageCalc = (args: {
  templateId: string
  tier: ServiceTier
  isEurPassport: boolean
}) => Promise<CoverageCalcResult>

export async function computeCoverage(params: {
  templates: Array<{ id: string; name: string }>
  tiers: ServiceTier[]
  isEurPassport: boolean
  calc: CoverageCalc
}): Promise<CoverageReport> {
  const { templates, tiers, isEurPassport, calc } = params
  const rows: CoverageRow[] = []
  const holesByKind: Record<string, number> = {}

  for (const template of templates) {
    for (const tier of tiers) {
      let result: CoverageCalcResult
      try {
        result = await calc({ templateId: template.id, tier, isEurPassport })
      } catch {
        // A thrown engine call (e.g. template not found) counts as incomplete.
        rows.push({
          templateId: template.id,
          templateName: template.name,
          tier,
          complete: false,
          holeCount: 0,
          holes: [],
        })
        continue
      }

      const holes = result.holes ?? []
      // Deliverable only if the engine ran AND reported complete.
      const complete = result.success !== false && (result.complete ?? holes.length === 0)

      rows.push({
        templateId: template.id,
        templateName: result.templateName || template.name,
        tier,
        complete,
        holeCount: holes.length,
        holes,
      })

      for (const hole of holes) {
        holesByKind[hole.kind] = (holesByKind[hole.kind] || 0) + 1
      }
    }
  }

  const incomplete = rows.filter((r) => !r.complete).length

  return {
    summary: {
      checked: rows.length,
      complete: rows.length - incomplete,
      incomplete,
      totalHoles: rows.reduce((n, r) => n + r.holeCount, 0),
      holesByKind,
    },
    rows,
  }
}
