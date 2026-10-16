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

describe('round 3 — security', () => {
  const SEND_ROUTES: Array<[string, 'email' | 'messaging']> = [
    ['bookings/[id]/send-confirmation', 'email'], ['invoices/[id]/reminder', 'email'], ['invoices/reminders', 'email'],
    ['quotes/[type]/[id]/send', 'email'], ['send-email', 'email'], ['send-supplier-document', 'email'], ['gmail/send', 'email'],
    ['copilot/drafts/[id]/send', 'messaging'], ['quotes/[type]/[id]/send-whatsapp', 'messaging'], ['whatsapp/messages', 'messaging'],
    ['whatsapp/notify-guide', 'messaging'], ['whatsapp/notify-resource', 'messaging'], ['whatsapp/send-contract', 'messaging'],
    ['whatsapp/send-invoice', 'messaging'], ['whatsapp/send-pickup', 'messaging'], ['whatsapp/send-quote', 'messaging'],
    ['whatsapp/send-receipt', 'messaging'], ['whatsapp/send-reminder', 'messaging'], ['whatsapp/send-status', 'messaging'],
    ['whatsapp/send-supplier-document', 'messaging'], ['whatsapp/send-thankyou', 'messaging'],
  ]
  it.each(SEND_ROUTES)('%s is staff-only and rate-limited', (route, channel) => {
    expect(read(`app/api/${route}/route.ts`)).toContain(`sendGuard('${channel}')`)
  })

  it('the send guard checks role, person and company', () => {
    const src = read('lib/send-guard.ts')
    expect(src).toContain("roleDenied(auth.role, 'staff')")
    expect(src).toContain('checkSharedRateLimit(auth.user.id, channel)')
    expect(src).toContain("'emailCompany' : 'messagingCompany'")
  })

  it('catalogue additions are the adding company\'s own', () => {
    const route = read('app/api/destination-catalog/manage/route.ts')
    expect(route.match(/added_by_tenant: tenant_id/g)?.length).toBe(2)
    const sql = read('supabase/migrations/435_private_catalogue_additions.sql')
    expect(sql).toContain('added_by_tenant IS NULL OR added_by_tenant = (SELECT public.get_user_tenant_id())')
  })

  it('only the cron or a platform admin can force a shared rate refresh', () => {
    const src = read('app/api/exchange-rates/refresh/route.ts')
    expect(src).toContain("const force = mayForce && searchParams.get('force') === 'true'")
    expect(src).not.toContain("headerSecret === cronSecret")
  })

  it('an unrouted concierge brief is refused, not given to the oldest company', () => {
    expect(read('lib/concierge-brand-routing.ts')).not.toContain("order('created_at', { ascending: true })")
  })

  it('only the person edits their own profile details', () => {
    expect(read('app/api/profiles/[id]/route.ts')).toContain('if (!isSelf && Object.keys(profileUpdate).length > 0)')
  })

  it('supplier documents take an allowlist of fields and the company\'s own ids', () => {
    const src = read('app/api/supplier-documents/route.ts')
    expect(src).toContain('SUPPLIER_DOCUMENT_FIELDS')
    const fields = src.slice(src.indexOf('SUPPLIER_DOCUMENT_FIELDS = ['), src.indexOf('] as const'))
    expect(fields).not.toMatch(/'status'|'confirmed_at'|'sent_at'|'tenant_id'/)
    expect(src).toContain("error: 'Supplier not found'")
  })

  it('stored paths are checked before the service role signs or deletes them', () => {
    expect(read('app/api/whatsapp/media/[id]/route.ts')).toContain('^inbound/${safeSid}')
    expect(read('app/api/supplier-invoices/[id]/route.ts')).toContain('path.startsWith(`${auth.tenant_id}/`)')
    expect(read('app/api/supplier-invoices/[id]/upload/route.ts')).toContain('previous.startsWith(`${tenant_id}/`)')
  })
})
