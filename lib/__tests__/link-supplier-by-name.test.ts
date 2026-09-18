import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  linkRowsBySupplierName,
  indexSuppliersByName,
  supplierNameGapMessage,
} from '@/lib/rates/link-supplier-by-name'

// ============================================
// A rate that names its company is linked to it
// ============================================
// Reported from the live app 2026-09-18: the Hotels page showed a table full
// of company names above a card reading "Linked to Company 0". Both were
// telling the truth — the rows carried supplier_NAME and no supplier_id,
// because the bulk import resolved supplier_code and supplier_id and ignored
// the column a human actually fills in. 57 rows across hotels, activities and
// meals were in that state, and the company filter (which matches on the id)
// found none of them.

// The real Travel2Egypt suppliers, as the workspace holds them.
const SUPPLIERS = [
  { id: 'sup-aracan', name: 'Aracan Hotels & Resorts' },
  { id: 'sup-azal', name: 'Azal Hospitality' },
  { id: 'sup-azur', name: 'Azur Hotels & Resorts' },
  { id: 'sup-paradise', name: 'Paradise Inn Group' },
  { id: 'sup-southsinai', name: 'South Sinai Hotels' },
]

describe('linkRowsBySupplierName', () => {
  it('links the rows that name a company this workspace knows', () => {
    const rows = [
      { service_code: 'ACC-LUX-0CG', supplier_name: 'Aracan Hotels & Resorts' },
      { service_code: 'ACC-ABU-DFR', supplier_name: 'Azal Hospitality' },
    ] as Array<Record<string, unknown>>

    const result = linkRowsBySupplierName(rows, SUPPLIERS)

    expect(result.linked).toBe(2)
    expect(result.gaps).toEqual([])
    expect(rows[0].supplier_id).toBe('sup-aracan')
    expect(rows[1].supplier_id).toBe('sup-azal')
  })

  it('does not care about case or stray spacing — people type', () => {
    const rows = [{ supplier_name: '  paradise inn GROUP ' }] as Array<Record<string, unknown>>
    expect(linkRowsBySupplierName(rows, SUPPLIERS).linked).toBe(1)
    expect(rows[0].supplier_id).toBe('sup-paradise')
  })

  it('never overrules a link the row already has', () => {
    // supplier_code resolution runs first and is the portable key; a name must
    // not quietly move the rate to a different company.
    const rows = [{ supplier_id: 'sup-azur', supplier_name: 'Aracan Hotels & Resorts' }] as Array<Record<string, unknown>>
    const result = linkRowsBySupplierName(rows, SUPPLIERS)
    expect(rows[0].supplier_id).toBe('sup-azur')
    expect(result.linked).toBe(0)
    expect(result.gaps).toEqual([])
  })

  it('imports the rate but reports an unknown company — it does not invent one', () => {
    // "Accor" was the one Travel2Egypt name with no supplier behind it.
    const rows = [{ service_code: 'ACC-ASW-MOV', supplier_name: 'Accor' }] as Array<Record<string, unknown>>
    const result = linkRowsBySupplierName(rows, SUPPLIERS)

    expect(rows[0].supplier_id).toBeUndefined()
    expect(result.linked).toBe(0)
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0].reason).toBe('unknown')
    expect(supplierNameGapMessage(result.gaps[0])).toContain('no supplier named "Accor"')
  })

  it('refuses to choose when two companies share a name', () => {
    const twins = [...SUPPLIERS, { id: 'sup-azal-2', name: 'Azal Hospitality' }]
    const rows = [{ supplier_name: 'Azal Hospitality' }] as Array<Record<string, unknown>>
    const result = linkRowsBySupplierName(rows, twins)

    expect(rows[0].supplier_id).toBeUndefined()
    expect(result.gaps[0].reason).toBe('ambiguous')
    expect(supplierNameGapMessage(result.gaps[0])).toContain('2 suppliers are named')
  })

  it('leaves a row that names nobody alone', () => {
    const rows = [{ supplier_name: '' }, { supplier_name: null }, {}] as Array<Record<string, unknown>>
    const result = linkRowsBySupplierName(rows, SUPPLIERS)
    expect(result.linked).toBe(0)
    expect(result.gaps).toEqual([])
    expect(rows.every(r => r.supplier_id === undefined)).toBe(true)
  })

  it('ignores a nameless supplier rather than matching everything to it', () => {
    const index = indexSuppliersByName([{ id: 'x', name: '  ' }, { id: 'y', name: null }])
    expect(index.size).toBe(0)
  })
})

describe('the import uses it', () => {
  const ROUTE = readFileSync(
    join(__dirname, '..', '..', 'app', 'api', 'rates', 'bulk', 'import', 'route.ts'),
    'utf8'
  )

  it('resolves names before the property link, which hangs off the supplier', () => {
    expect(ROUTE).toContain('linkRowsBySupplierName(rowsToUpsert, all ?? [])')
    expect(ROUTE.indexOf('linkRowsBySupplierName')).toBeLessThan(ROUTE.indexOf('resolveRateProperty('))
  })

  it('scopes the supplier lookup to the tenant', () => {
    expect(ROUTE).toMatch(/\.select\('id, name'\)\s*\n\s*\.eq\('tenant_id', tenant_id\)/)
  })

  it('reports an unmatched name without calling the import a failure', () => {
    // The rate imported cleanly; a missing company is something to fix in
    // Suppliers, not a reason to tell the operator the import broke.
    expect(ROUTE).toContain('errors: [...importErrors, ...supplierNameGaps]')
    expect(ROUTE).toContain('success: importErrors.length === 0')
  })
})
