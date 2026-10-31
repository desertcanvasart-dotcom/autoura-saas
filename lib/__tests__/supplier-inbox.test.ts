import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe("the signed-in supplier's inbox", () => {
  const home = read('app/supplier-home/page.tsx')

  it('shows only agencies that confirmed the sign-in; others are listed with nothing of theirs', () => {
    expect(home).toContain("all.filter(l => l.status === 'approved')")
    expect(home).toContain('loadSupplierAgency(db, l.tenant_id as string, l.supplier_id as string, today)')
    expect(home).toContain("redirect('/supplier-login')")
  })

  it('answers reach only a line of a confirmed (agency, supplier) pair, never one the agency covers itself', () => {
    const r = read('app/api/supplier-account/lines/[lineId]/route.ts')
    expect(r).toContain('approvedLinks(db, signedIn.account.id)')
    expect(r).toContain('l.tenant_id === line.tenant_id && l.supplier_id === line.supplier_id')
    expect(r).toContain("line.resource_kind !== 'own'")
    expect(r).toContain('applySupplierAnswer(')
  })

  it('days off name the agency by its approved claim — never an id the supplier could pick — and delete only their own', () => {
    const r = read('app/api/supplier-account/days-off/route.ts')
    expect(r).toContain('(await approvedLinks(db, signedIn.account.id)).find(l => l.id === linkId)')
    expect(r).toContain('clearSupplierDayOff(db, { tenantId: found.link.tenant_id, supplierId: found.link.supplier_id }')
    expect(r).not.toMatch(/body\.(tenant_id|supplier_id)/)
  })

  it('approved claims only', () => {
    expect(read('lib/supplier-session.ts')).toContain(".eq('account_id', accountId).eq('status', 'approved')")
  })

  it('the per-agency link page and the inbox show the same thing (one loader, one view)', () => {
    const page = read('app/supplier/[token]/page.tsx')
    expect(page).toContain('loadSupplierAgency(db, link.tenant_id, link.supplier_id')
    expect(page).toContain('<SupplierAgencyView')
    expect(home).toContain('<SupplierAgencyView')
    expect(page).toContain('href="/supplier-login"')
  })

  it('the loader reads every table scoped to the agency and supplier', () => {
    const data = read('lib/supplier-page-data.ts')
    expect(data.match(/\.eq\('tenant_id', tenantId\)/g)!.length).toBeGreaterThanOrEqual(5)
    expect(data).not.toMatch(/notes|receipt/)
  })
})
