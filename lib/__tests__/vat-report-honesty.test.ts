import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The tax tab once reported "estimated VAT" as a hardcoded 14% of gross
// revenue while every invoice in the same query carried its REAL
// tax_amount — an estimate wearing a report. VAT figures must come from
// the invoices' own tax lines; untracked input VAT is a named hole, never
// a percentage guess.

const SRC = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'api', 'financial-reports', 'route.ts'),
  'utf8'
)

describe('VAT report honesty', () => {
  it('no hardcoded VAT rate anywhere in the report', () => {
    expect(SRC).not.toMatch(/0\.14/)
    expect(SRC).not.toMatch(/estimated_vat/)
  })

  it('vat_collected sums the invoices own tax lines', () => {
    expect(SRC).toMatch(/vat_collected:.*tax_amount/)
  })

  it('the invoice query fetches tax_amount and the FX spec converts it', () => {
    expect(SRC).toMatch(/select\('[^']*tax_amount[^']*'\)/)
    expect(SRC).toMatch(/\{ name: 'tax_amount', date:/)
  })
})
