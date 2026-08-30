// Guard: the pricing grid's AI parse route must read rates through the same
// currency boundary its dropdown route does.
//
// /api/pricing-grid/rates normalized its rows into the tenant's run currency;
// /api/pricing-grid/parse did not, and its rate values flow straight into
// slot items (rateEur/rateNonEur -> SlotRow). A row priced at 600 EGP was
// therefore prefilled by the AI path as 600 of the run currency.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(
  join(__dirname, '..', '..', 'app', 'api', 'pricing-grid', 'parse', 'route.ts'),
  'utf8'
)

// Every rate table the parse route reads for its AI catalog.
const RATE_TABLES = [
  'transportation_rates', 'guide_rates', 'airport_staff_rates',
  'hotel_staff_rates', 'tipping_rates', 'activity_rates',
  'accommodation_rates', 'entrance_fees', 'flight_rates',
  'meal_rates', 'nile_cruises', 'sleeping_train_rates',
]

describe('pricing-grid parse route currency boundary', () => {
  it('selects rate_currency on every rate table it reads', () => {
    const missing = RATE_TABLES.filter((t) => {
      const m = SRC.match(new RegExp(`from\\('${t}'\\)\\.select\\('([^']*)'\\)`))
      // A table read with select('*') already carries the column.
      return m ? !/rate_currency|\*/.test(m[1]) : false
    })
    expect(missing).toEqual([])
  })

  it('normalizes every rate table into the run currency', () => {
    const missing = RATE_TABLES.filter((t) => !SRC.includes(`norm('${t}'`))
    expect(missing).toEqual([])
  })

  it('resolves the run currency from the tenant rather than assuming EUR', () => {
    expect(SRC).toContain('getTenantRunCurrency(admin, tenantId)')
  })
})
