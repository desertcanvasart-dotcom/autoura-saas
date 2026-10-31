import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CLAIM_DECIDERS, claimNextStatus } from '@/lib/supplier-claims'

const read = (p: string) => readFileSync(p, 'utf8')

describe('an admin confirms a supplier sign-in (§9)', () => {
  it('pending → confirmed or not them; connected → disconnect; not connected → connect', () => {
    expect(claimNextStatus('pending', 'approve')).toEqual({ ok: true, status: 'approved' })
    expect(claimNextStatus('pending', 'reject')).toEqual({ ok: true, status: 'rejected' })
    expect(claimNextStatus('approved', 'reject')).toEqual({ ok: true, status: 'rejected' })
    expect(claimNextStatus('rejected', 'approve')).toEqual({ ok: true, status: 'approved' })
    expect(claimNextStatus('approved', 'approve').ok).toBe(false)
    expect(claimNextStatus('pending', 'maybe').ok).toBe(false)
  })

  it('only owners and admins decide; the change goes through row security and only from the state it was read in', () => {
    const route = read('app/api/supplier-claims/[id]/route.ts')
    expect(route).toContain("roleDenied(auth.role, 'admin')")
    expect(route).not.toContain('createAdminClient')
    expect(route).toContain(".eq('status', claim.status)")
    expect(route).toContain('already connected to another sign-in')
  })

  it('signing in rings only the owners and admins of each agency asked', () => {
    expect(CLAIM_DECIDERS).toEqual(['owner', 'admin'])
    const verify = read('app/api/supplier-auth/verify/route.ts')
    expect(verify).toContain('roles: CLAIM_DECIDERS')
    expect(verify).toContain('dedupe_key: `supplier-claim:${claim.id}`')
  })

  it('the list shows this agency’s claims only; the phone is read with the service role for exactly those accounts', () => {
    const list = read('app/api/supplier-claims/route.ts')
    expect(list).toContain(".eq('tenant_id', tenant_id)")
    expect(list).toContain('const accountIds = [...new Set(claims.map(c => c.account_id as string))]')
    expect(list).toContain(".in('id', accountIds)")
    expect(list).toContain(".in('account_id', accountIds)")
    expect(list).not.toMatch(/from\('supplier_accounts'\)[^\n]*\.select\('[^']*(token|code)/)
  })

  it('the Suppliers page shows waiting requests and each card its sign-in, with actions for admins only', () => {
    const page = read('app/suppliers/suppliers-content.tsx')
    expect(page).toContain('<SupplierSignInRequests isAdmin={isAdmin} />')
    expect(page).toContain('<SupplierSignInStatus supplierId={selectedSupplier.id} isAdmin={isAdmin} />')
  })
})
