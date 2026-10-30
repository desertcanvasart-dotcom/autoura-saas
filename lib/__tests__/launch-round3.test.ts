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

describe('round 3 — money', () => {
  it('a booking with payments is kept, not deleted with them', () => {
    const src = read('app/api/bookings/[id]/route.ts')
    expect(src).toContain(".from('booking_payments')")
    expect(src).toContain('has payments recorded')
  })

  it('an invoice with payments is not deleted; its extras are released on delete or cancel', () => {
    const src = read('app/api/invoices/[id]/route.ts')
    expect(src).toContain('delete them before deleting it')
    expect(src.match(/releaseInvoicedExtras\(id\)/g)?.length).toBe(2)
    expect(src).toContain('update({ invoiced_at: null, invoice_id: null })')
  })

  it('an invoice total cannot be edited below what was paid', () => {
    expect(read('app/api/invoices/[id]/route.ts')).toContain('the total cannot be less than that')
  })

  it('a final invoice subtracts the deposit actually invoiced, from the real trip total', () => {
    expect(read('app/api/invoices/route.ts')).toContain("parent.invoice_type === 'deposit'")
    expect(read('app/invoices/[id]/page.tsx')).toContain('tripTotal: tripTotal > 0 ? tripTotal : undefined')
  })

  it('"send all due" follows the first-reminder rule on the company\'s own day', () => {
    const src = read('app/api/invoices/reminders/route.ts')
    expect(src).toContain('daysOverdueOn(invoice.due_date, companyToday)')
    expect(src).toContain('isFirstReminderDue(invoice.next_reminder_date, overdue)')
  })

  it('reports leave out drafts and count revenue net of VAT', () => {
    const src = read('app/api/financial-reports/route.ts')
    expect(src).toContain("new Set(['cancelled', 'draft'])")
    expect(src).toContain('const netRevenue = totalRevenue - vatCollected')
  })

  it('a closing company sends no payment reminders', () => {
    expect(read('app/api/cron/send-reminders/route.ts')).toContain("from('tenant_closures')")
  })

  it('an itinerary with expenses or supplier invoices is not deleted', () => {
    const src = read('app/api/itineraries/[id]/route.ts')
    expect(src).toContain("from('expenses')")
    expect(src).toContain("from('supplier_invoices')")
  })

  it('an over-balance booking payment is a 409 with the reason', () => {
    expect(read('app/api/bookings/[id]/payments/route.ts')).toContain("code === '23514'")
  })
})

describe('round 3 — reliability', () => {
  it('Resend webhooks are verified with their Svix signature', async () => {
    const crypto = await import('crypto')
    const { verifySvix } = await import('@/lib/svix')
    const raw = Buffer.from('test-secret-bytes-0123456789')
    const secret = `whsec_${raw.toString('base64')}`
    const body = '{"type":"email.bounced"}'
    const now = 1_800_000_000
    const sig = crypto.createHmac('sha256', raw).update(`msg_1.${now}.${body}`).digest('base64')
    const h = { id: 'msg_1', timestamp: String(now), signature: `v1,${sig}` }
    expect(verifySvix(secret, h, body, now)).toBe(true)
    expect(verifySvix(secret, h, body + ' ', now)).toBe(false)
    expect(verifySvix(secret, h, body, now + 3600)).toBe(false)
    expect(verifySvix(undefined, h, body, now)).toBe(false)
  })

  it('a bounced address is not mailed again, and its reminders pause', () => {
    expect(read('lib/email-send.ts')).toContain('suppressedAmong(recipients)')
    expect(read('app/api/quotes/[type]/[id]/send/route.ts')).toContain('suppressedAmong([toEmail])')
    const cron = read('app/api/cron/send-reminders/route.ts')
    expect(cron).toMatch(/if \(result\.suppressed\) \{\s*await supabase\.from\('invoices'\)\.update\(\{ reminder_paused: true \}\)/)
  })

  it('AI work started by inbound messages is capped and runs after the response', () => {
    const wa = read('app/api/whatsapp/webhook/route.ts')
    expect(wa.match(/inboundAiAllowed\(tenantId, `wa:\$\{conversationId\}`\)/g)?.length).toBe(2)
    expect(wa).toMatch(/!isDuplicateDelivery\) \{\s*after\(async \(\) => \{/)
    expect(read('app/api/email/sync/route.ts')).toContain('inboundAiAllowed(tenant_id, `mail:${cid}`)')
  })

  it('every Gmail call has a timeout', () => {
    expect(read('lib/google.ts')).toContain('google.options({ timeout: 60_000 })')
    for (const f of ['lib/gmail.ts', 'lib/gmail-mailbox.ts', 'app/api/cron/mail-alerts/route.ts', 'app/api/gmail/poll/route.ts']) {
      expect(read(f), f).not.toContain("import { google } from 'googleapis'")
    }
  })

  it('a revoked Gmail grant is removed, not a red run every time', () => {
    expect(read('app/api/cron/mail-alerts/route.ts')).toContain('forgetRevokedMailbox(')
    expect(read('app/api/cron/gmail-sync/route.ts')).toContain('forgetRevokedMailbox(')
  })

  it('file parsing refuses oversized bodies and zip bombs before reading them', () => {
    const src = read('app/api/ai/parse-file/route.ts')
    expect(src).toContain("request.headers.get('content-length')")
    expect(src).toContain('MAX_DOCX_XML_BYTES')
  })

  it('an approved WhatsApp draft is claimed before it is sent', () => {
    const src = read('app/api/copilot/drafts/[id]/send/route.ts')
    expect(src.indexOf(".neq('status', 'sent')")).toBeLessThan(src.indexOf('await sendWhatsAppMessage('))
  })

  it('no stack traces or database details in API responses', () => {
    expect(read('app/api/resources/hotels/route.ts')).not.toContain('stack: error.stack')
    expect(read('app/api/suppliers/route.ts')).not.toContain('details: error.message')
  })
})

describe('round 3 — first run', () => {
  it('the itinerary editor and tour manager offer the company\'s own cities', () => {
    const editor = read('app/itineraries/[id]/edit/page.tsx')
    expect(editor).toContain('useDestinationCities()')
    expect(editor).not.toMatch(/'Cairo', 'Giza'/)
    expect(editor).not.toContain("|| 'Cairo'")
    const tours = read('app/tours/manage/TourManagerContent.tsx')
    expect(tours).not.toContain('EGYPTIAN_CITIES')
  })

  it('confirmation links land on sign-in, lost ones can be resent, and a taken email says so', () => {
    const auth = read('app/contexts/AuthContext.tsx')
    expect(auth).toContain('emailRedirectTo: `${window.location.origin}/login?confirmed=1`')
    expect(auth).toContain('identities.length === 0')
    expect(read('app/login/login-content.tsx')).toContain('<ResendConfirmation')
    expect(read('app/signup/signup-content.tsx')).toContain('<ResendConfirmation')
  })

  it('the reset page takes token-hash and code links, not only the old hash', () => {
    const src = read('app/reset-password/page.tsx')
    expect(src).toContain("verifyOtp({ token_hash: tokenHash, type: 'recovery' })")
    expect(src).toContain('exchangeCodeForSession(code)')
  })

  it('a company with no subscription has no "current plan"', () => {
    const src = read('app/settings/billing/plans/page.tsx')
    expect(src).toContain("useState<string>('')")
    expect(src).not.toContain("fetch('/api/settings/pricing-tier')")
  })

  it('back from checkout, the billing page waits for the plan', () => {
    expect(read('app/settings/billing/page.tsx')).toContain("get('success') !== 'true'")
  })

  it('an unpriced quote can be sent anyway from the page', () => {
    const page = read('app/itineraries/[id]/page.tsx')
    expect(page).toContain('postAllowingIncomplete(')
    expect(page).toContain('allow_incomplete: true')
    expect(read('app/api/send-email/route.ts')).not.toContain('allow_incomplete=true.')
  })

  it('the sending domain can be set up in Settings → Email', () => {
    expect(read('app/settings/email/page.tsx')).toContain('<SendingDomainCard')
  })

  it('no "Nile" in the navigation and onboarding', () => {
    expect(read('lib/nav/config.ts')).not.toContain('Nile Cruises')
    expect(read('app/onboarding/steps/BusinessStep.tsx')).not.toContain('Nile Cruises')
    expect(read('app/settings/message-templates/page.tsx')).not.toContain("language: 'ar'")
  })
})

describe('the Anthropic key', () => {
  it('is cleaned of the whitespace and quotes a pasted key picks up', async () => {
    const { anthropicApiKey } = await import('@/lib/ai/anthropic-client')
    expect(anthropicApiKey('sk-ant-abc\n')).toBe('sk-ant-abc')
    expect(anthropicApiKey('"sk-ant-abc"')).toBe('sk-ant-abc')
    expect(anthropicApiKey(" 'sk-ant-abc' ")).toBe('sk-ant-abc')
    expect(anthropicApiKey(undefined)).toBe('')
  })
  it('can be checked from the deep health endpoint', () => {
    expect(read('app/api/health/deep/route.ts')).toContain('checkAnthropicKey()')
  })
})
