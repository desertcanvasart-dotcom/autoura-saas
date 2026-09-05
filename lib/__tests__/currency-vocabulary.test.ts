import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { SUPPORTED_CURRENCIES, CURRENCY_SYMBOLS } from '@/lib/currency'

// ============================================
// ONE currency vocabulary (B-item 6)
// ============================================
// lib/currency.ts is the single home: SUPPORTED_CURRENCIES (which the DB
// CHECKs mirror — migration 299) and CURRENCY_SYMBOLS (via
// getCurrencySymbol). Before this test, seventeen files carried their own
// hand-typed {EUR:'€',USD:'$',…} maps — most knowing three or four codes,
// so an AED invoice printed its code with no format and the vocabularies
// drifted one file at a time. Two rules:
//   1. The migration's CHECK list and the constant must be identical.
//   2. No file outside lib/currency.ts may hand-type a symbol map or a
//      currency array — exemptions are listed WITH their reason.

const ROOT = path.join(__dirname, '..', '..')

// Files allowed to carry their own currency vocabulary, and why.
const EXEMPT: Array<{ file: string; reason: string }> = [
  {
    file: 'app/b2b/partners/page.tsx',
    reason:
      "a PARTNER's billing currency (CHF/AUD/CAD/JPY…) is a genuinely different vocabulary from the tenant's rate currencies — the exemption B6 itself names",
  },
  {
    file: 'app/clients/new/page.tsx',
    reason: "client billing preference is deliberately narrow (EUR/USD/GBP) — a display choice, not the rate vocabulary",
  },
]

describe('the DB CHECK and the constant are one vocabulary', () => {
  it('migration 299 lists exactly SUPPORTED_CURRENCIES', () => {
    const sql = readFileSync(path.join(ROOT, 'supabase', 'migrations', '299_widen_currency_set.sql'), 'utf8')
    const m = sql.match(/allowed TEXT := \$list\$\(([^)]+)\)\$list\$/)
    if (!m) throw new Error('299: could not find the allowed list')
    const checkList = [...m[1].matchAll(/'([A-Z]{3})'/g)].map(x => x[1])
    expect(checkList).toEqual([...SUPPORTED_CURRENCIES])
  })

  it('every supported currency has a symbol', () => {
    for (const code of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_SYMBOLS[code], `${code} has no symbol`).toBeTruthy()
    }
  })
})

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* sourceFiles(full)
    else if (/\.tsx?$/.test(entry) && !full.includes('__tests__')) yield full
  }
}

describe('no hand-typed currency vocabularies outside lib/currency.ts', () => {
  it('finds no local symbol maps or currency arrays', () => {
    const violations: string[] = []
    // A symbol map: EUR mapped to its symbol (literal or escaped) — the
    // signature of every local map this sweep removed. A currency array:
    // 'EUR' and 'USD' hand-typed side by side.
    const symbolMap = /EUR\s*[:=]\s*['"`](€|\\u20AC)/
    const currencyArray = /['"]EUR['"]\s*,\s*['"]USD['"]/
    for (const dir of ['app', 'components', 'lib', 'hooks']) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/')
        if (rel === 'lib/currency.ts') continue
        if (EXEMPT.some(e => e.file === rel)) continue
        const src = readFileSync(file, 'utf8')
        for (const [name, re] of [['symbol map', symbolMap], ['currency array', currencyArray]] as const) {
          if (re.test(src)) {
            violations.push(`${rel}: hand-typed ${name} — use SUPPORTED_CURRENCIES / getCurrencySymbol from lib/currency.ts, or add a reasoned exemption`)
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })
})
