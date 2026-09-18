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

describe('choosing the hotel for a night', () => {
  it('offers a choice per TIER — the same programme at two tiers is two hotels', () => {
    expect(SOURCE).toContain('Hotel for this night')
    expect(SOURCE).toMatch(/tiers\.map\(tier => \{/)
    expect(SOURCE).toContain('setDayProperties')
  })

  it('defaults to Automatic, so nothing is chosen for the operator', () => {
    expect(SOURCE).toMatch(/Automatic — whatever this tier has in/)
  })

  it('writes only the tiers that named one', () => {
    expect(SOURCE).toMatch(/Object\.values\(dayProperties\)\.some\(Boolean\)/)
    expect(SOURCE).toMatch(/\.filter\(\(\[, id\]\) => Boolean\(id\)\)/)
  })

  it('offers it only where a night is actually spent', () => {
    expect(SOURCE).toMatch(/dayNight !== 'none' && dayCity\.trim\(\) && tiers\.length > 0/)
  })

  it('says what a named hotel means when it later disappears', () => {
    expect(SOURCE).toMatch(/shows a gap rather than quietly using a different one/)
  })
})

describe('a cruise night chooses a SHIP', () => {
  it('asks the ships catalogue, not the hotels in a city', () => {
    expect(SOURCE).toMatch(/dayNight === 'cruise'\s*\n?\s*\? `\/api\/rates\/cruises/)
    expect(SOURCE).toContain('r.ship_name')
  })

  it('re-reads when the night type changes, not only the city', () => {
    expect(SOURCE).toMatch(/\}, \[dayCity, dayNight, tiers\]\)/)
  })

  it('says ship, not hotel, everywhere the operator reads it', () => {
    expect(SOURCE).toContain("'Ship for this night'")
    expect(SOURCE).toContain('🚢 Named ship')
  })
})
