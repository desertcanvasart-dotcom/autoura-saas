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
//   CORRECT   app/rates/hotels: `PPD (€)` labels a field bound to `ppd_eur`.
//             The column is EUR by definition. Converting it would make the
//             label lie.
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
        const n = (fs.readFileSync(path.join(ROOT, r), 'utf8').match(/€/g) ?? []).length
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
        `currency column. If the value is EUR by definition (a *_eur rate column), say so\n` +
        `in a comment and raise the baseline deliberately.\n\n` +
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
