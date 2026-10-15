import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Email audit fixes — the wiring that makes each one hold
// ============================================

const ROOT = path.join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

describe('linking an email to a client', () => {
  const route = read('app/api/email/links/route.ts')
  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function DELETE'))

  it('checks the client belongs to the caller’s company before writing the link', () => {
    const check = post.indexOf(".eq('tenant_id', authResult.tenant_id)")
    expect(check, 'POST must scope the client to the tenant').toBeGreaterThan(-1)
    expect(check).toBeLessThan(post.indexOf(".from('email_client_links')"))
    expect(post).toContain("'Client not found'")
  })
})

describe('the Google OAuth callback', () => {
  const route = read('app/api/auth/google/callback/route.ts')

  it('stores expiry_date as the absolute time it already is', () => {
    expect(route).not.toMatch(/Date\.now\(\)\s*\+\s*\(?\s*tokens\.expiry_date/)
    expect(route).toContain('new Date(tokens.expiry_date ||')
  })
})

describe('the sending-domain settings route', () => {
  const route = read('app/api/settings/email-domain/route.ts')

  it('writes the guarded columns with the service role, after its owner/admin check', () => {
    expect(route.match(/createAdminClient\(\)\s*\n?\s*\.from\('tenants'\)\s*\n?\s*\.update/g)?.length).toBe(2)
    expect(route).not.toMatch(/auth\.supabase!\s*\n\s*\.from\('tenants'\)\s*\n\s*\.update/)
  })

  it('does not report Verified when saving the status failed', () => {
    const put = route.slice(route.indexOf('export async function PUT'))
    expect(put).toMatch(/if \(saveError\)/)
  })
})

describe('migration 420', () => {
  const sql = read('supabase/migrations/420_email_domain_guard_and_gmail_expiry.sql')

  it('stops signed-in users changing any sending-domain column', () => {
    expect(sql).toContain("current_user IN ('authenticated', 'anon')")
    for (const col of ['email_domain', 'email_from_local', 'email_domain_status', 'email_domain_verified_at', 'resend_domain_id']) {
      expect(sql, col).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`)
    }
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.tenants/)
  })

  it('repairs the far-future Gmail token expiries', () => {
    expect(sql).toMatch(/UPDATE public\.gmail_tokens\s+SET token_expiry = now\(\)/)
  })
})

describe('the Gmail send route', () => {
  const route = read('app/api/gmail/send/route.ts')

  it('hands the guard the mailbox company', () => {
    expect(route).toMatch(/claimSend\(supabase, String\(requestKey\), \{\s*tenantId: mailboxTenant/)
    expect(route).toMatch(/threadConflict\(supabase, \{\s*tenantId: mailboxTenant/)
  })
})

describe('the Gmail actions route', () => {
  const route = read('app/api/gmail/actions/route.ts')

  it('refuses permanent delete plainly — the app never asks for the scope it needs', () => {
    expect(route).not.toContain('gmail.users.messages.delete(')
    expect(route).toContain('Permanent delete is not available')
  })
})

describe('the attachment download', () => {
  const route = read('app/api/gmail/attachments/route.ts')

  it('names the file with filename*= rather than a percent-encoded filename=', () => {
    expect(route).not.toContain('filename="${encodeURIComponent(filename)}"')
    expect(route).toContain('attachmentNameParams(filename).disposition')
  })
})
