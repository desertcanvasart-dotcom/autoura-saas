// ============================================
// What an import of the block sheet would change
// ============================================
// The sheet is matched to the library by code: a new code adds a block, a
// known one updates it, and a block the sheet does not mention is left alone
// (an import never deletes). Pure, so the preview the screen shows is exactly
// what applying writes.

import type { DayBlock } from './blocks'

export interface StoredBlock extends DayBlock {
  id: string
}

export interface ImportPlan {
  added: DayBlock[]
  updated: { id: string; block: DayBlock; changed: string[] }[]
  unchanged: string[]
}

const FIELDS: (keyof DayBlock)[] = [
  'name', 'shorthand', 'day_type', 'city', 'to_city', 'night', 'night_place', 'attractions',
  'photo_stops', 'guide', 'meals', 'transport', 'assistance', 'optional_extras', 'description', 'notes', 'source',
]

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function planImport(sheet: readonly DayBlock[], stored: readonly StoredBlock[]): ImportPlan {
  const byCode = new Map(stored.map(s => [s.code, s]))
  const plan: ImportPlan = { added: [], updated: [], unchanged: [] }
  for (const block of sheet) {
    const existing = byCode.get(block.code)
    if (!existing) {
      plan.added.push(block)
      continue
    }
    const changed = FIELDS.filter(f => !same(block[f], existing[f]))
    if (changed.length === 0) plan.unchanged.push(block.code)
    else plan.updated.push({ id: existing.id, block, changed })
  }
  return plan
}
