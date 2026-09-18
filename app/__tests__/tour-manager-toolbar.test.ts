import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// One menu for the file plumbing
// ============================================
// The Tour Programs Manager toolbar had grown to nine buttons, six of them
// near-identical grey CSV buttons. The worst of it was not the clutter: the
// days import REPLACES the whole itinerary of every tour the file names, and
// it sat beside "Export Days" at the same size, in the same grey, one word
// apart. Two sheets are right — a tour and a day are different rows — six
// top-level buttons are not.

const ROOT = path.join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), 'utf8')
const SOURCE = read('app', 'tours', 'manage', 'TourManagerContent.tsx')
const HEADER = SOURCE.slice(SOURCE.indexOf('{/* Header */}'), SOURCE.indexOf('<div className="container mx-auto px-4 lg:px-6 py-6">'))

describe('the toolbar', () => {
  it('keeps one primary action and one menu, not six grey lookalikes', () => {
    expect(HEADER).toContain('<ToolbarMenu')
    expect(HEADER).toContain('label="Import / Export"')
    // The six former buttons, gone from the toolbar itself.
    for (const label of ['Sample CSV', 'Sample Days', 'Export Days', 'Import Days']) {
      expect(HEADER, label).not.toMatch(new RegExp(`>\\s*${label}\\s*<`))
    }
  })

  it('loses no capability — all six actions are still reachable', () => {
    for (const handler of [
      'onSelect: handleSampleCsv',
      'onSelect: handleExportTemplates',
      'onSelect: handleSampleDaysCsv',
      'onSelect: handleExportDays',
      'bulkFileRef.current?.click()',
      'daysFileRef.current?.click()',
    ]) {
      expect(HEADER, handler).toContain(handler)
    }
  })

  it('separates the two sheets, and says which one pricing reads', () => {
    expect(HEADER).toContain('Tours — one row per tour')
    expect(HEADER).toContain('Days — one row per day (what pricing reads)')
  })

  it('marks the destructive import as destructive', () => {
    expect(HEADER).toMatch(/label: 'Import days — replaces itineraries'[\s\S]{0,400}?danger: true/)
  })
})

describe('importing a days sheet', () => {
  it('shows what it will replace before it replaces it', () => {
    // The endpoint always had a dry run (app/api/tours/bulk/import-days).
    // The button never used it, so an itinerary could be replaced by a
    // misclick with no warning and no undo.
    expect(SOURCE).toMatch(/dryRun: true/)
    expect(SOURCE).toMatch(/title: 'Replace these itineraries\?'/)
    expect(SOURCE).toMatch(/variant: 'danger'/)
  })

  it('does nothing when the operator says no', () => {
    expect(SOURCE).toMatch(/if \(!ok\) \{[\s\S]{0,160}?return/)
  })

  it('counts from the file, rather than claiming a number it does not know', () => {
    expect(SOURCE).toContain('${dry.templates} tour(s) named in this file')
    expect(SOURCE).toContain('${dry.days} day(s) in the sheet')
  })
})

describe('the menu itself', () => {
  const MENU = read('components', 'ToolbarMenu.tsx')

  it('closes the way a menu is expected to', () => {
    expect(MENU).toContain("document.addEventListener('mousedown', onDown)")
    expect(MENU).toMatch(/e\.key === 'Escape'/)
    expect(MENU).toMatch(/removeEventListener\('mousedown', onDown\)/)
    expect(MENU).toMatch(/removeEventListener\('keydown', onKey\)/)
  })

  it('is announced as a menu', () => {
    expect(MENU).toContain('aria-haspopup="menu"')
    expect(MENU).toContain('aria-expanded={open}')
    expect(MENU).toContain('role="menuitem"')
  })

  it('closes before it acts, so the page is not left with a menu over it', () => {
    expect(MENU).toContain('onClick={() => { setOpen(false); item.onSelect() }}')
  })
})
