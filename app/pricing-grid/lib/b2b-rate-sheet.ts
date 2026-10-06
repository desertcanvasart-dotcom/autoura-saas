// ============================================
// The B2B rate sheet a grid save hands its quote
// ============================================
// A B2B quote is a price list for partners: what the trip costs at each group
// size. Every page that shows one — the quote, its list row, the email, the
// PDF, WhatsApp — reads `pricing_table` keyed by group size:
//
//     { "2": { pp, total }, "4": { pp, total }, … }
//
// A grid save used to store ONE row as a list ([{ pax, total, … }]), which
// those pages read as a single "0 pax" column with no price.
//
// The grid prices the sheet with its own engine (calculatePaxRange): the
// vehicle re-chosen for each group size, per-unit items, the throughout
// guide. It sends COSTS — the quote route owns the margin (the partner's own,
// when it has one), so the sheet and the quote's selling price agree.

import type { GridConfig, GridDay } from '../types'
import { calculatePaxRange, type TransportTierIndex } from './calculator'

/** The group sizes a B2B sheet prices — the same as every other B2B quote. */
export const B2B_SHEET_PAX = [2, 4, 6, 8, 10, 12, 15, 20, 25, 30]

/** Most rows a quote accepts — the standard sizes, the trip's own and room to spare. */
export const MAX_SHEET_ROWS = 40

export interface SheetCost {
  pax: number
  /** The whole group's cost at this size, before margin. */
  totalCost: number
}

/** The grid's cost at each sheet size, and at the trip's own group size. */
export function gridSheetCosts(
  days: GridDay[],
  config: GridConfig,
  tierIndex: TransportTierIndex,
  throughout?: { groupExtraEur: number },
): SheetCost[] {
  const sizes = [...new Set([...B2B_SHEET_PAX, Math.max(1, Math.floor(config.pax) || 1)])].sort((a, b) => a - b)
  const sheet = calculatePaxRange(days, { ...config, marginPercent: 0 }, tierIndex, {
    paxFrom: sizes[0],
    paxTo: sizes[sizes.length - 1],
    // The throughout guide's bed / meals / seats, and his seat in every vehicle.
    throughoutGroupExtraEur: throughout?.groupExtraEur ?? 0,
    throughoutExtraSeats: config.guideMode === 'throughout' ? 1 : 0,
  })
  const wanted = new Set(sizes)
  return sheet.paxPricing
    .filter(row => wanted.has(row.numPax))
    .map(row => ({ pax: row.numPax, totalCost: row.withoutLeader.totalCost }))
}

/** A sheet sent by a client, checked: whole positive sizes, real costs, no repeats. */
export function cleanSheetCosts(raw: unknown): SheetCost[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SHEET_ROWS) return null
  const seen = new Set<number>()
  const rows: SheetCost[] = []
  for (const r of raw) {
    const pax = Number((r as SheetCost)?.pax)
    const totalCost = Number((r as SheetCost)?.totalCost)
    if (!Number.isInteger(pax) || pax < 1 || pax > 100 || seen.has(pax)) return null
    if (!Number.isFinite(totalCost) || totalCost < 0) return null
    seen.add(pax)
    rows.push({ pax, totalCost })
  }
  return rows.sort((a, b) => a.pax - b.pax)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The quote's pricing_table, keyed by group size, at `marginPercent`. The
 * quote's own group size shows the quote's selling price exactly, so the
 * sheet and the quote never disagree by a cent.
 */
export function keyedPricingTable(
  costs: SheetCost[],
  marginPercent: number,
  own: { pax: number; sellingPrice: number; pricePerPerson: number },
): Record<string, { pp: number; total: number }> {
  const table: Record<string, { pp: number; total: number }> = {}
  for (const { pax, totalCost } of costs) {
    const total = round2(totalCost * (1 + marginPercent / 100))
    table[String(pax)] = { pp: round2(total / pax), total }
  }
  table[String(own.pax)] = { pp: own.pricePerPerson, total: own.sellingPrice }
  return table
}
