import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// A day can be edited, and says where it is
// ============================================
// The Tour Manager could only ADD or REMOVE a day, so correcting a typo meant
// rebuilding it — and days built there stored no city and no night type, which
// is why the engine was reading both out of the title. On the live 12-day
// "Egypt End to End" that meant 11 of 12 nights billed as nights aboard, and
// any day the wording could not place was priced as Cairo.

const SOURCE = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'tours', 'manage', 'TourManagerContent.tsx'),
  'utf8'
)

describe('editing a day', () => {
  it('loads the day back into the form', () => {
    expect(SOURCE).toMatch(/const editDay = \(index: number\)/)
    expect(SOURCE).toContain('setEditingDayIndex(index)')
  })

  it('saves in place, keeping the day number — it does not append a copy', () => {
    expect(SOURCE).toMatch(/onChange\(itinerary\.map\(\(d, i\) => \(i === editingDayIndex \? newDay : d\)\)\)/)
    expect(SOURCE).toContain('itinerary[editingDayIndex].day')
  })

  it('can be abandoned', () => {
    expect(SOURCE).toContain('resetDayForm')
    expect(SOURCE).toMatch(/onClick=\{resetDayForm\}/)
  })

  it('offers the edit alongside remove', () => {
    expect(SOURCE).toMatch(/onClick=\{\(\) => editDay\(index\)\}/)
    expect(SOURCE).toMatch(/onClick=\{\(\) => removeDay\(index\)\}/)
  })
})

describe('the day says where it is and where the night is', () => {
  it('collects both', () => {
    expect(SOURCE).toContain('setDayCity')
    expect(SOURCE).toContain('setDayNight')
  })

  it('writes them onto the day only when stated', () => {
    expect(SOURCE).toMatch(/\.\.\.\(dayCity\.trim\(\) \? \{ city: dayCity\.trim\(\) \} : \{\}\)/)
    expect(SOURCE).toMatch(/\.\.\.\(dayNight \? \{ accommodation_type: dayNight \} : \{\}\)/)
  })

  it('says plainly what a blank means, rather than leaving it a mystery', () => {
    expect(SOURCE).toContain('Not stated — read from the title')
    expect(SOURCE).toMatch(/a day it cannot place is a gap, not Cairo/)
  })

  it('shows what each day carries, including when it carries nothing', () => {
    expect(SOURCE).toContain('city not stated — read from the title')
    expect(SOURCE).toContain('night not stated — read from the title')
  })
})
