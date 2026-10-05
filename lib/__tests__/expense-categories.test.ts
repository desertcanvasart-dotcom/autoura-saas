import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EXPENSE_CATEGORIES, TRIP_EXPENSE_CATEGORIES, supplierTypesForCategory } from '@/lib/expense-categories'

// The expense forms offer the suppliers a category is paid to (a meal → the
// agency's restaurants), and the database must accept every category they save.

describe('expense categories', () => {
  it('lists the right suppliers for the main trip costs', () => {
    expect(supplierTypesForCategory('meal')).toEqual(['restaurant'])
    expect(supplierTypesForCategory('hotel')).toEqual(['hotel'])
    expect(supplierTypesForCategory('guide')).toEqual(['guide'])
    expect(supplierTypesForCategory('cruise')).toEqual(['cruise'])
    expect(supplierTypesForCategory('transportation')).toContain('transport_company')
    expect(supplierTypesForCategory('entrance')).toContain('attraction')
  })

  it('keeps free text for costs with no supplier list', () => {
    expect(supplierTypesForCategory('tipping')).toEqual([])
    expect(supplierTypesForCategory('fuel')).toEqual([])
    expect(supplierTypesForCategory('unknown')).toEqual([])
  })

  it('leaves office overheads off the itinerary form', () => {
    const trip = TRIP_EXPENSE_CATEGORIES.map(c => c.value)
    expect(trip).not.toContain('office')
    expect(trip).toContain('meal')
  })

  it('every category is allowed by migration 395', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/395_expense_categories.sql'), 'utf8')
    const allowed = sql.slice(sql.indexOf('CHECK (category IN'))
    for (const c of EXPENSE_CATEGORIES) expect(allowed).toContain(`'${c.value}'`)
  })
})
