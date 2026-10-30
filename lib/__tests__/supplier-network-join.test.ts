import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkPaperUpload, paperKey } from '@/lib/supplier-network-papers'

const read = (p: string) => readFileSync(p, 'utf8')
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])

describe("a supplier's papers", () => {
  it('a real PDF or photo, checked by its contents; no Word files; 10 MB at most', () => {
    expect(checkPaperUpload(PDF, 'application/pdf')).toMatchObject({ ok: true, ext: 'pdf' })
    expect(checkPaperUpload(PDF, 'image/png').ok).toBe(false)
    expect(checkPaperUpload(new Uint8Array([1, 2, 3]), 'application/pdf').ok).toBe(false)
    expect(checkPaperUpload(PDF, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').ok).toBe(false)
    expect(checkPaperUpload(new Uint8Array(0), 'application/pdf').ok).toBe(false)
  })
  it('stored under the account, in the private network bucket', () => {
    expect(paperKey('acc', 'u', 'pdf')).toBe('acc/u.pdf')
    const r = read('app/api/supplier-account/network-papers/route.ts')
    expect(r).toContain('NETWORK_PAPERS_BUCKET')
    expect(r).toContain("paperKey(me.account.id, randomUUID(), verdict.ext)")
  })
  it('a supplier removes only their own papers and can never read one back', () => {
    const r = read('app/api/supplier-account/network-papers/route.ts')
    expect(r).toContain(".eq('account_id', me.account.id)")
    expect(r).not.toMatch(/createSignedUrl|download\(/)
    expect(r).not.toMatch(/export async function GET/)
  })
})

describe('the network profile', () => {
  const r = read('app/api/supplier-account/network-profile/route.ts')
  it('only the signed-in supplier, and only their own profile', () => {
    expect(r).toContain('supplierFromToken(')
    expect(r).toContain("account_id: me.account.id")
    expect(r).not.toMatch(/body\.account_id/)
  })
  it('a supplier can never verify themselves — sending puts it in the queue (pending) and tells the Autoura team', () => {
    expect(r).not.toMatch(/verification_status: 'verified'/)
    expect(r).toContain("verification_status: 'pending'")
    expect(r).toContain('tellAutouraTeam(')
  })
  it('needs a paper before checking; changing name or kinds of a verified profile is checked again', () => {
    expect(r).toContain('Upload at least one paper')
    expect(r).toContain("current?.verification_status === 'verified'")
  })
  it('the join section never imports server upload code into the browser', () => {
    expect(read('app/supplier-home/NetworkJoin.tsx')).not.toContain('supplier-network-papers')
  })
})
