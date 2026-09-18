import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// The same five-button pile, for the same reason
// ============================================
// Suppliers had Sample CSV · Import · Export · Properties CSV · Import
// Properties, because it too has two grains: a supplier, and the ships or
// hotels that supplier owns. The sheets are right; five toolbar buttons that
// look alike are not — "Properties CSV" downloads while "Import Properties"
// uploads, and only the word says which.

const ROOT = path.join(__dirname, '..', '..')
const SOURCE = readFileSync(path.join(ROOT, 'app', 'suppliers', 'suppliers-content.tsx'), 'utf8')
const HEADER = SOURCE.slice(SOURCE.indexOf('Manage supplier relationships'), SOURCE.indexOf('{/* Type Tabs */}'))

describe('the suppliers toolbar', () => {
  it('carries one menu instead of five lookalike buttons', () => {
    expect(HEADER).toContain('<ToolbarMenu')
    expect(HEADER).toContain('label="Import / Export"')
    for (const label of ['Sample CSV', 'Properties CSV', 'Import Properties']) {
      expect(HEADER, label).not.toMatch(new RegExp(`>\\s*${label}\\s*<`))
    }
  })

  it('loses no capability', () => {
    for (const handler of [
      'onSelect: handleSampleCsv',
      'onSelect: handleExport',
      'onSelect: handleExportProperties',
      'importInputRef.current?.click()',
      'propertiesInputRef.current?.click()',
    ]) {
      expect(HEADER, handler).toContain(handler)
    }
  })

  it('keeps the primary action and the code reconciler out of the menu', () => {
    expect(HEADER).toContain('Add Supplier')
    expect(HEADER).toContain('<ReconcileCodes')
  })

  it('names the two sheets by their row, and says what an import matches on', () => {
    expect(HEADER).toContain('Suppliers — one row per supplier')
    expect(HEADER).toContain('Properties — one row per ship, hotel or train')
    expect(HEADER).toContain('supplier + kind + name')
  })
})
