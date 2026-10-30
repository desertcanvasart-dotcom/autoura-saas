import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { copyTypes } from '@/lib/supplier-network'

const read = (p: string) => readFileSync(p, 'utf8')

describe('the agency side of the network', () => {
  it("a copy takes only the kinds the agency's vocabulary has", () => {
    expect(copyTypes(['guide', 'transport_company'], ['hotel', 'guide'])).toEqual(['guide'])
    expect(copyTypes(['cruise'], ['guide'])).toEqual([])
  })

  it('sourcing: anyone reads it, only owners and admins change it, only to own / network / both', () => {
    const r = read('app/api/settings/supplier-sourcing/route.ts')
    expect(r).toContain("roleDenied(auth.role, 'admin')")
    expect(r).toContain('isSourcing(body.sourcing)')
  })

  it('search: only for network / both agencies, through row security (listed + verified), never a phone or email', () => {
    const r = read('app/api/network-suppliers/route.ts')
    expect(r).toContain('usesNetwork(')
    expect(r).not.toContain('createAdminClient')
    expect(r).toContain(".select('account_id, display_name, kinds, cities, languages, about')")
    expect(r).toContain('toPublicProfile')
  })

  it('add: managers and up; the profile is read through row security; the copy is on THIS agency, one per agency', () => {
    const r = read('app/api/network-suppliers/[accountId]/route.ts')
    expect(r).toContain("roleDenied(auth.role, 'manage')")
    expect(r).toContain("await supabase.from('supplier_network_profiles')")
    expect(r).toContain('network_account_id: accountId')
    expect(r).toContain(".eq('tenant_id', tenant_id).eq('network_account_id', accountId)")
  })

  it('add: connected at once (an approved claim), the price left to agree — no rate copied', () => {
    const r = read('app/api/network-suppliers/[accountId]/route.ts')
    expect(r).toContain("status: 'approved'")
    expect(r).not.toMatch(/from\('[a-z_]*_rates'\)/)
  })

  it('the setting sits on Settings → Company, and the menu links the search', () => {
    expect(read('app/settings/company/page.tsx')).toContain('<SupplierSourcingSetting canEdit={isAdmin} />')
    expect(read('lib/nav/config.ts')).toContain("href: '/network-suppliers'")
  })
})

describe('a supplier already on the list is never added twice', () => {
  it('search and add both recognise one connected by their own sign-in, not just a network copy', () => {
    for (const f of ['app/api/network-suppliers/route.ts', 'app/api/network-suppliers/[accountId]/route.ts']) {
      const r = readFileSync(f, 'utf8')
      expect(r, f).toContain("from('supplier_account_links')")
      expect(r, f).toContain(".eq('status', 'approved')")
    }
  })
})
