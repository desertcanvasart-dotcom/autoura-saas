import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// Check 12's own prescribed fix: "a test refusing new literals".
//
// 429 hard-coded `€` across 106 files, and a multi-tenant app where one tenant
// already bills in USD. They cannot all be converted at once, and — importantly
// — they SHOULD NOT be. The two kinds look identical and are not:
//
//   WAS CORRECT, NO LONGER   app/rates/hotels: `PPD (€)` labelling a field
//             bound to `ppd_eur`. That reasoning held while the column was
//             EUR by definition. Migration 298 (tenants.rates_currency) ended
//             that: the *_eur NAME is historical, and the column now holds
//             whatever currency the tenant keeps its rates in, with an
//             individual rate free to override it (rate_currency, mig 295).
//             For a USD tenant the € label states the wrong currency for the
//             number beside it, so the rate forms were swept in C3.4b and
//             read their symbol from useRateCurrency() instead. If you are
//             about to cite this example to justify a new literal: check
//             whether the value is EUR by DEFINITION or merely by default.
//
//   WRONG     app/invoices: `€{totalRevenue}` sums invoices that each carry
//             their OWN `currency` column — hard-coded symbol AND different
//             currencies added into one figure.
//
// So this does not forbid the symbol. It pins the count PER FILE and fails if
// any file grows, which stops the debt spreading while the discrimination is
// worked through. Per file, not in total, for the same reason the lint ratchet
// had to become per rule: a single number lets one file's debt pay for
// another's, and the total looks fine while the wrong file grows.
//
// Paying it down:  npx vitest run -u  is NOT enough — edit the baseline by
// hand so the reduction is visible in review.
// ============================================================================

const ROOT = path.resolve(__dirname, '../..')
const BASELINE = path.join(ROOT, 'scripts/euro-literal-baseline.json')

function countEuroLiterals(): Record<string, number> {
  const out: Record<string, number> = {}
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const r = `${rel}/${e.name}`
      if (e.isDirectory()) walk(r)
      // This file itself is excluded: it has to print the symbol to explain
      // the rule, and counting its own examples would make the ratchet fail
      // every time someone improved the message.
      else if (/\.tsx?$/.test(e.name) && !r.endsWith('euro-literal-ratchet.test.ts')) {
        // The € escape spells the same symbol and was used to slip past
        // this very ratchet (fixed-costs, ServiceRatePicker — A-item 2).
        const src = fs.readFileSync(path.join(ROOT, r), 'utf8')
        const n =
          (src.match(/€/g) ?? []).length + (src.match(/\\u20AC/gi) ?? []).length
        if (n) out[r] = n
      }
    }
  }
  for (const base of ['app', 'components', 'lib']) walk(base)
  return out
}

describe('euro-literal ratchet', () => {
  const baseline: Record<string, number> = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const current = countEuroLiterals()

  it('has a baseline that is not vacuously empty', () => {
    expect(Object.keys(baseline).length).toBeGreaterThan(50)
  })

  it('no file may gain a hard-coded € — and a new file may not introduce one', () => {
    const grown: string[] = []
    for (const [file, n] of Object.entries(current)) {
      const was = baseline[file] ?? 0
      if (n > was) grown.push(`${file}: ${was} → ${n}`)
    }
    expect(
      grown,
      `Hard-coded € grew. This app is multi-tenant and one tenant already bills in USD.\n` +
        `Use lib/currency.ts (formatCurrency / getCurrencySymbol) with the record's own\n` +
        `currency column. A *_eur column is NOT automatically EUR — since migration 298\n` +
        `it holds the tenant's rates currency (see this file's header). If the value really\n` +
        `is EUR by definition, say so in a comment and raise the baseline deliberately.\n` +
        `\n` +
        grown.join('\n')
    ).toEqual([])
  })

  it('reports progress when a file is cleaned up', () => {
    const shrunk = Object.entries(baseline).filter(([f, was]) => (current[f] ?? 0) < was)
    if (shrunk.length) {
      // Not a failure — a nudge to lock the reduction in.
      console.log(`↓ ${shrunk.length} file(s) reduced their € literals — update scripts/euro-literal-baseline.json`)
    }
    expect(true).toBe(true)
  })
})
