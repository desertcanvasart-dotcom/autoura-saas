// ============================================
// Pricing Grid — Pure Calculation Engine
// ============================================
// All amounts in EUR. No side effects, no DOM access.
// Currency conversion applied at display time only.

import type { GridDay, GridConfig, DayCalc, GridTotals, EMPTY_TOTALS } from '../types'
import { GROUP_SLOTS, PER_PERSON_SLOTS, getSlotDef } from './slot-mapping'

// --- Per-Day Calculation ---

export function calculateDay(day: GridDay, config: GridConfig): DayCalc {
  const pax = Math.max(config.pax, 1)

  // 1. Sum group slot costs
  let groupTotal = 0
  for (const slot of day.slots) {
    const def = getSlotDef(slot.slotId)
    if (!def || def.category !== 'group') continue

    // Skip guide when disabled
    if (slot.slotId === 'guide' && !config.withGuide) continue

    // Filter guide-related tipping when guide disabled
    if (slot.slotId === 'tipping' && !config.withGuide) {
      // Only include non-guide tipping (driver, porter, etc.)
      // Guide tips are excluded — we use a reduced rate
      // For multi-select tipping, the resolvedRate already reflects selections
      // The filtering happens at the UI/rate level, not here
    }

    groupTotal += slot.resolvedRate
  }

  // 2. Sum per-person slot costs
  let perPersonTotal = 0
  for (const slot of day.slots) {
    const def = getSlotDef(slot.slotId)
    if (!def || def.category !== 'per_person') continue
    perPersonTotal += slot.resolvedRate
  }

  // 3. Calculate derived values
  const groupPerPerson = groupTotal / pax
  const dailyPerPerson = groupPerPerson + perPersonTotal
  const dailyTotal = dailyPerPerson * pax

  return {
    groupTotal,
    perPersonTotal,
    groupPerPerson,
    dailyPerPerson,
    dailyTotal,
  }
}

// --- Grand Totals Across All Days ---

export function calculateGrandTotals(days: GridDay[], config: GridConfig): GridTotals {
  if (days.length === 0) {
    return { costPerPerson: 0, totalCost: 0, marginAmount: 0, sellingPricePerPerson: 0, sellingPriceTotal: 0 }
  }

  const pax = Math.max(config.pax, 1)

  // Sum all days' dailyPerPerson
  let costPerPerson = 0
  for (const day of days) {
    const dayCalc = calculateDay(day, config)
    costPerPerson += dayCalc.dailyPerPerson
  }

  const totalCost = costPerPerson * pax

  // Apply margin (clamped 0-200%)
  const margin = Math.max(0, Math.min(200, config.marginPercent))
  const sellingPricePerPerson = costPerPerson * (1 + margin / 100)
  const sellingPriceTotal = sellingPricePerPerson * pax
  const marginAmount = sellingPriceTotal - totalCost

  return {
    costPerPerson,
    totalCost,
    marginAmount,
    sellingPricePerPerson,
    sellingPriceTotal,
  }
}

// --- Currency Conversion (display only) ---

export function convertAmount(eurAmount: number, exchangeRate: number | null): number {
  if (!exchangeRate || exchangeRate <= 0) return eurAmount
  return eurAmount * exchangeRate
}

// --- Format currency for display ---

export function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    EUR: '\u20AC',
    USD: '$',
    GBP: '\u00A3',
    EGP: 'EGP ',
  }
  const symbol = symbols[currency] || currency + ' '
  return `${symbol}${amount.toFixed(2)}`
}
