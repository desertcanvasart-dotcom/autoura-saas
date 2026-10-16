import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { csvCell } from '@/lib/account/data-export'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('round 3 — fixes to the previous two rounds', () => {
  it('export CSV keeps negative numbers as numbers, and still defuses text formulas', () => {
    expect(csvCell(-150)).toBe('-150')
    expect(csvCell('-150')).toBe("'-150")
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
  })

  it('client and partner search escape the term once', () => {
    for (const f of ['app/api/clients/route.ts', 'app/api/b2b/partners/route.ts']) {
      const src = read(f)
      expect(src, f).not.toContain('orSearchTerm(')
      expect(src, f).toContain('orIlikeContains(')
    }
  })

  it('attachment downloads open the stored refresh token', () => {
    expect(read('app/api/gmail/attachments/route.ts')).toContain('refresh_token: openToken(tokenData.refresh_token)')
  })

  it('an unreadable Gmail token does not stop the row being deleted', () => {
    const src = read('lib/gmail-revoke.ts')
    expect(src).toMatch(/try \{\s*token = openToken/)
  })

  it('company purge: every file path is read, a failed count keeps the login, Gmail errors do not abort', () => {
    const src = read('lib/account/company-closure.ts')
    expect(src).toContain("fetchAllPages<{ storage_path: string | null }")
    expect(src).toContain("fetchAllPages<{ media_storage_path: string | null }")
    expect(src).toMatch(/if \(countError \|\| count === null\)/)
    expect(src).toMatch(/try \{\s*const r = await revokeAndForgetMailbox/)
  })

  it('the purge job tries the least recently attempted company first and records failures', () => {
    const src = read('app/api/cron/purge-closed-companies/route.ts')
    expect(src).toContain("order('last_attempt_at', { ascending: true, nullsFirst: true })")
    expect(src).toContain('last_error')
  })

  it('a retried payment is answered before the balance check', () => {
    const src = read('app/api/invoices/[id]/payments/route.ts')
    const replay = src.indexOf(".eq('idempotency_key', idempotencyKey)")
    expect(replay).toBeGreaterThan(-1)
    expect(replay).toBeLessThan(src.indexOf('Payment amount exceeds balance due ('))
  })

  it('a WhatsApp failure is final and notified once', () => {
    expect(read('lib/whatsapp-outbound.ts')).toContain(".not('status', 'in', '(failed,undelivered)')")
  })

  it('stored plain-text Gmail tokens are sealed by the sync job', () => {
    expect(read('app/api/cron/gmail-sync/route.ts')).toContain('sealToken(row.refresh_token)')
  })
})
