import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { applyDayForm, type DayForm } from '@/lib/tours/day-edit'

// The save used to be written inline in the component, and these tests read
// its source. It now lives in lib/tours/day-edit.ts, so they call it instead —
// which also proves what the source scans only implied.
const blankForm = (over: Partial<DayForm> = {}): DayForm => ({
  title: 'A day', description: '', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, picked: [],
  transportType: '', transportRateId: '', city: '', night: '', cityTransfer: false, length: '',
  propertiesByTier: {}, noSightseeing: false, ...over,
})

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
    const unstated = applyDayForm(null, blankForm(), 1)
    expect(unstated).not.toHaveProperty('city')
    expect(unstated).not.toHaveProperty('accommodation_type')
    const stated = applyDayForm(null, blankForm({ city: ' Luxor ', night: 'hotel' }), 1)
    expect(stated).toMatchObject({ city: 'Luxor', accommodation_type: 'hotel' })
    expect(SOURCE).toMatch(/applyDayForm\(existing, \{/)
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
    expect(applyDayForm(null, blankForm({ propertiesByTier: { standard: 'h1', luxury: '' } }), 1).property_by_tier).toEqual({ standard: 'h1' })
    expect(applyDayForm(null, blankForm({ propertiesByTier: { standard: '' } }), 1)).not.toHaveProperty('property_by_tier')
  })

  it('offers it only where a night is actually spent', () => {
    // …and not on a day spent in the air, which has no night to pick a hotel for.
    expect(SOURCE).toMatch(/dayNight !== 'none' && dayNight !== 'in_transit' && dayCity\.trim\(\) && tiers\.length > 0/)
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

describe('the edit can actually be found', () => {
  // Reported 2026-09-18 from the live app: "all programs imported through CSV
  // is not editable, especially the section of the tour days itself". The Edit
  // and Remove controls existed — as bare icons with `opacity-0
  // group-hover:opacity-100`, so they were invisible until the pointer
  // happened to rest on the day, and on a touch screen there is no hover at
  // all. A control nobody can see is a control that is not there.
  const DAY_LIST = SOURCE.slice(SOURCE.indexOf('{/* Added Days List */}'))

  it('shows the day controls without waiting for a hover', () => {
    expect(DAY_LIST).not.toMatch(/opacity-0\s+group-hover:opacity-100/)
  })

  it('names them, rather than leaving an icon to be guessed at', () => {
    expect(DAY_LIST).toMatch(/onClick=\{\(\) => editDay\(index\)\}[\s\S]{0,400}?>\s*[\s\S]{0,200}?Edit\s*<\/button>/)
    expect(DAY_LIST).toMatch(/onClick=\{\(\) => removeDay\(index\)\}[\s\S]{0,400}?>\s*[\s\S]{0,200}?Remove\s*<\/button>/)
  })

  it('tells the operator the days can be changed', () => {
    expect(SOURCE).toMatch(/every day below can be changed/)
  })

  it('brings the form to the operator — a 12-day programme is taller than the modal', () => {
    expect(SOURCE).toContain('const dayFormRef = useRef<HTMLDivElement>(null)')
    expect(SOURCE).toMatch(/dayFormRef\.current\?\.scrollIntoView/)
    expect(SOURCE).toContain('ref={dayFormRef}')
  })
})

describe('how long the sightseeing runs', () => {
  it('offers the agency\'s three lengths, in their hours', () => {
    expect(SOURCE).toContain('Half day (4 hours)')
    expect(SOURCE).toContain('Full day (8 hours)')
    expect(SOURCE).toContain('Long day (12 hours)')
  })

  it('writes it only when chosen, so a day that does not say prices as before', () => {
    expect(applyDayForm(null, blankForm(), 1)).not.toHaveProperty('sightseeing_length')
    expect(applyDayForm(null, blankForm({ length: 'half_day' }), 1).sightseeing_length).toBe('half_day')
  })

  it('says what it is for', () => {
    expect(SOURCE).toMatch(/transport for the day is priced from the matching route/)
  })
})
