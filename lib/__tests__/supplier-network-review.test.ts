import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { reviewChange, reviewEmail } from '@/lib/supplier-network-review'

const read = (p: string) => readFileSync(p, 'utf8')

describe('the Autoura team checks network suppliers (§7)', () => {
  it('verify a waiting profile; reject it with a note; take a verification back with a note', () => {
    expect(reviewChange('pending', 'verify', '')).toEqual({ ok: true, status: 'verified', note: null })
    expect(reviewChange('pending', 'reject', ' ID unreadable ')).toEqual({ ok: true, status: 'rejected', note: 'ID unreadable' })
    expect(reviewChange('verified', 'revoke', 'Licence expired')).toEqual({ ok: true, status: 'rejected', note: 'Licence expired' })
  })
  it('never without a note to the supplier, never out of order', () => {
    expect(reviewChange('pending', 'reject', '').ok).toBe(false)
    expect(reviewChange('verified', 'verify', '').ok).toBe(false)
    expect(reviewChange('unverified', 'verify', '').ok).toBe(false)
    expect(reviewChange('pending', 'revoke', 'x').ok).toBe(false)
    expect(reviewChange('pending', 'maybe', 'x').ok).toBe(false)
  })
  it('the supplier is told in plain words, with the note', () => {
    expect(reviewEmail('verify', 'Nile Cars', null).text).toContain('you are verified')
    expect(reviewEmail('reject', 'Nile Cars', 'ID unreadable').text).toContain('ID unreadable')
  })
})

describe('only super admins, and only the right paper', () => {
  it('every route demands a super admin', () => {
    for (const f of ['app/api/super-admin/network-suppliers/route.ts', 'app/api/super-admin/network-suppliers/[accountId]/route.ts', 'app/api/super-admin/network-suppliers/[accountId]/papers/[docId]/route.ts']) {
      expect(read(f), f).toContain('await requireSuperAdmin()')
    }
  })
  it('a paper link is for that account’s paper, under its folder, for one minute', () => {
    const r = read('app/api/super-admin/network-suppliers/[accountId]/papers/[docId]/route.ts')
    expect(r).toContain(".eq('id', docId).eq('account_id', accountId)")
    expect(r).toContain('path.startsWith(`${accountId}/`)')
    expect(r).toContain('createSignedUrl(path, 60)')
  })
  it('the list never sends a storage path', () => {
    const list = read('app/api/super-admin/network-suppliers/route.ts')
    expect(list.slice(list.indexOf("from('supplier_network_documents')"), list.indexOf("from('suppliers')"))).not.toContain('storage_path')
  })
  it('the decision only from the state it was read in, and the supplier is told', () => {
    const r = read('app/api/super-admin/network-suppliers/[accountId]/route.ts')
    expect(r).toContain(".eq('verification_status', profile.verification_status)")
    expect(r).toContain('reviewEmail(')
  })
  it('the menu links the page', () => {
    expect(read('app/super-admin/layout.tsx')).toContain("href: '/super-admin/network'")
  })
})
