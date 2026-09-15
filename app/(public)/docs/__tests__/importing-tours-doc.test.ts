import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The Importing Tours page is the operator's contract for what the import
// does. These pin the sentences that must not drift from the code they
// describe (lib/tours/template-csv.ts, lib/tours/itinerary-csv.ts).
// Whitespace-normalised: the page is JSX, and a sentence wrapped across a
// source line is still one sentence to the reader.
const doc = readFileSync(join(process.cwd(), 'app/(public)/docs/importing-tours/page.tsx'), 'utf8')
  .replace(/\s+/g, ' ')

describe('Importing Tours doc states the rules the code enforces', () => {
  it('two sheets, imported in order', () => {
    expect(doc).toContain('Import the template sheet first')
    expect(doc).toContain('a days sheet never creates a tour')
  })
  it('every meal on every day is stated, with the three words and what each costs', () => {
    expect(doc).toContain('Every meal, every day, stated')
    for (const w of ['included', 'external', 'none']) expect(doc).toContain(`>${w}<`)
    expect(doc).toContain('external is a cost')
  })
  it('Meals Included on the template sheet is export-only', () => {
    expect(doc).toContain('ignored on import')
  })
  it('a days sheet replaces the whole itinerary and days must be contiguous', () => {
    expect(doc).toContain('replaces the whole itinerary')
    expect(doc).toContain('no gaps or repeats')
  })
  it('vocabulary values accept words or keys and unknown values are refused', () => {
    expect(doc).toContain('either the word you see on the form')
    expect(doc).toContain('refused by name')
  })
})
