import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

// The itinerary edit page showed Package Type as big cards (with the rest
// behind "Show advanced options"); it is one compact row of buttons, as in
// the pricing grid's InputPanel.
describe('itinerary edit: Package Type is one compact row, like the pricing grid', () => {
  const page = read('app/itineraries/[id]/edit/page.tsx')

  it('every type is a small button in one row, the description as a tooltip', () => {
    expect(page).toContain('{PACKAGE_TYPES.map(pkg => (')
    expect(page).toContain('title={pkg.desc}')
    expect(page).toContain('px-3 py-1.5 text-xs font-semibold rounded-lg border')
  })

  it('no big cards and no advanced-options toggle', () => {
    expect(page).not.toContain('showAdvancedPackages')
    expect(page).not.toContain('advanced options')
    expect(page).not.toContain('<pkg.icon')
  })
})
