// A rate amount must be displayed in the currency that amount is actually in,
// and rate amounts in different currencies must never be merged into one stat.
//
// Rate columns are named *_eur, but the NAME is historical: a column holds the
// tenant's rates currency, and an individual row may override it. The rates
// tables ignored both. Every amount went through `convert(amount)` with no
// source currency, so the converter assumed the base currency and applied an
// FX rate: a row stored as 500 EGP was multiplied as though it were 500 EUR.
// The number on screen was in no currency at all — not the one it was entered
// in, not the one the viewer had picked (operator, 1 Sep).
//
// The stat tiles did the matching thing one level up: sum every row's raw
// amount, divide by the row count, print the viewer's symbol in front.
//
// Both rules below describe code that shipped.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const RATES = join(ROOT, 'app', 'rates')

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(e)) out.push(full)
  }
  return out
}

const rel = (f: string) => f.replace(ROOT + '/', '')
const lineOf = (src: string, i: number) => src.slice(0, i).split('\n').length

/** The text of the call's second argument (call starts at `open`, a '('),
 *  or null when there is no top-level comma. */
function secondArgument(src: string, open: number): string | null {
  let depth = 0
  let commaAt = -1
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return commaAt === -1 ? null : src.slice(commaAt + 1, i).trim()
    } else if (ch === ',' && depth === 1 && commaAt === -1) commaAt = i
  }
  return null
}

const hasSecondArgument = (src: string, open: number): boolean =>
  secondArgument(src, open) !== null

describe('row-currency display', () => {
  it('every convert() on a rates page names the currency it is converting FROM', () => {
    // convert(amount) silently means "this amount is in the base currency".
    // For a rate row that is an assumption, not a fact, and it was wrong for
    // every row an operator had entered in their own currency.
    const violations: string[] = []
    for (const file of walk(RATES)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/(?<![A-Za-z_$.])convert\(/g)) {
        const open = m.index! + m[0].length - 1
        if (!hasSecondArgument(src, open)) {
          violations.push(`${rel(file)}:${lineOf(src, m.index!)} — convert() with no source currency`)
        }
      }
    }
    expect(
      violations,
      'Pass the source currency: convert(amount, row.rate_currency || tenantCurrency). ' +
        'To display a rate as entered — which is what a rates table should do — ' +
        'use fmtRate(amount, row) from useRateRowFormat() and do not convert at all.'
    ).toEqual([])
  })

  it("the named source currency is the ROW's, never a quoted literal", () => {
    // convert(amount, 'EUR') passes the first rule while making the same
    // assumption it exists to forbid: since migration 298 a *_eur column
    // holds the tenant's rates currency, so the source must be read off the
    // row (row.rate_currency || tenantCurrency), not asserted in quotes. If
    // a value truly is a fixed currency by definition, put it in a named
    // constant whose comment says why — the literal-in-the-call is what
    // this forbids.
    const violations: string[] = []
    for (const file of walk(RATES)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/(?<![A-Za-z_$.])convert\(/g)) {
        const open = m.index! + m[0].length - 1
        const arg = secondArgument(src, open)
        if (arg && /^['"`][A-Za-z]{3}['"`]$/.test(arg)) {
          violations.push(`${rel(file)}:${lineOf(src, m.index!)} — convert(amount, ${arg}) hardcodes the source currency`)
        }
      }
    }
    expect(
      violations,
      "Read the source currency off the record: convert(amount, row.rate_currency || tenantCurrency)."
    ).toEqual([])
  })

  it('no rates page averages a rate column across currencies by hand', () => {
    // Money in different currencies does not add, and does not average.
    const violations: string[] = []
    for (const file of walk(RATES)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/\.reduce\(\(sum/g)) {
        violations.push(`${rel(file)}:${lineOf(src, m.index!)} — hand-rolled sum over rows that each carry a currency`)
      }
    }
    expect(
      violations,
      'Use averageRateInOneCurrency(rows, getAmount, getCurrency) from lib/currency-totals ' +
        'and render it with fmtAverage(), which averages within one currency or shows a dash.'
    ).toEqual([])
  })
})
