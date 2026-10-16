import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// An invitation that is "accepted" but creates no membership is the worst
// possible outcome: the invitee is told they have joined, the inviter sees the
// invitation used, and the person is sitting in a different company entirely.
// Nothing in the app inserted into tenant_members at all — these guard the
// pieces that now make an invitation actually mean something.
// ============================================================================

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// Source scans must look at real code, never at prose: a doc comment
// explaining why we stopped doing something matches a substring check for it.
// Strip comment lines before asserting a call is ABSENT.
function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

function bodyOf(src: string, marker: string): string {
  const i = src.indexOf(marker)
  expect(i, `marker not found: ${marker}`).toBeGreaterThan(-1)
  return src.slice(i)
}

describe('accepting an invitation creates the membership', () => {
  const src = read('app/api/invitations/accept/route.ts')
  const body = bodyOf(src, 'export async function POST')

  it('inserts into tenant_members', () => {
    expect(body).toMatch(/from\(['"]tenant_members['"]\)[\s\S]{0,120}\.insert\(/)
  })

  it('takes the tenant and the role from the invitation, not from the request', () => {
    expect(body).toContain('tenant_id: invitation.tenant_id')
    expect(body).toContain('role: invitation.role')
  })

  it('creates the membership BEFORE marking the invitation accepted', () => {
    // Order is the whole guarantee. Marking first is exactly how the old flow
    // reported success while leaving the person in no company.
    const insert = body.search(/from\(['"]tenant_members['"]\)[\s\S]{0,120}\.insert\(/)
    const accepted = body.indexOf("status: 'accepted'")
    expect(insert).toBeGreaterThan(-1)
    expect(accepted).toBeGreaterThan(-1)
    expect(insert).toBeLessThan(accepted)
  })

  it('undoes an account it created if the membership fails', () => {
    expect(body).toContain('deleteUser')
  })

  it('does not write a profile role — the membership IS the grant', () => {
    // Was max(existing, invited) against user_profiles.role, back when that
    // column was what the UI enforced. tenant_members.role is now the single
    // source (lib/roles.ts), so writing a second one could only drift.
    expect(codeOnly(body)).not.toContain('PROFILE_ROLE')
    expect(codeOnly(body)).not.toMatch(/profileUpdate\s*=\s*\{[^}]*\brole\b/)
  })
})

describe('holding the invitation link never owns the address', () => {
  // The inviter is handed the same link (copy-link fallback, resend), so the
  // token proves nothing about the mailbox. Accepting used to create the
  // account confirmed with the typed password, and overwrite an unconfirmed
  // account's password — whoever held the link owned the address.
  const body = codeOnly(bodyOf(read('app/api/invitations/accept/route.ts'), 'export async function POST'))

  it('creates a new account unconfirmed, with a password nobody is told', () => {
    expect(body).toContain('email_confirm: false')
    expect(body).toContain('password: unusablePassword()')
    expect(body).not.toContain('email_confirm: true')
  })

  it('never changes an existing account', () => {
    expect(body).not.toContain('updateUserById')
  })

  it('takes no password from the request', () => {
    expect(body).toMatch(/const \{ token, full_name \} = await request\.json\(\)/)
  })

  it('sends the set-password link to the invited address, and undoes a new account if it cannot', () => {
    expect(body).toContain('sendPasswordSetupEmail(admin as any, email,')
    const send = body.indexOf('sendPasswordSetupEmail(')
    expect(body.slice(send)).toContain('deleteUser(userId)')
  })

  it('the setup link is a one-time recovery link to /reset-password', () => {
    const lib = read('lib/invitation-setup-email.ts')
    expect(lib).toContain("type: 'recovery'")
    expect(lib).toContain('/reset-password')
  })

  it('the invite page asks for no password and does not sign anyone up or in', () => {
    const page = codeOnly(read('app/invite/accept/page.tsx'))
    expect(page.match(/supabase\.auth\.signUp\(/)).toBeNull()
    expect(page).not.toContain('signInWithPassword')
    expect(page).not.toContain('type={showPassword')
    expect(page).toContain('invitation?.has_account ? { token } : { token, full_name: fullName }')
    expect(page).toContain('check_email')
  })

  // An existing login keeps its password, so asking for a new one on the
  // invite form only produces a password that never works (live 2026-09-24).
  it('tells the page up front when the address already has a login', () => {
    const verify = bodyOf(read('app/api/invitations/verify/route.ts'), 'export async function GET')
    expect(verify).toContain('has_account: hasAccount')
    expect(verify).toContain('email_confirmed_at') // same test as the accept route
  })

  it('an existing login sees a note in place of the fields', () => {
    const page = codeOnly(read('app/invite/accept/page.tsx'))
    expect(page).toMatch(/invitation\?\.has_account \? \(\s*<p/)
  })
})

describe('super-admin power needs a confirmed address', () => {
  it('isConfirmedSuperAdmin refuses an unconfirmed account on the allowlist', async () => {
    const prev = process.env.SUPER_ADMIN_EMAILS
    process.env.SUPER_ADMIN_EMAILS = 'boss@autoura.test'
    try {
      const { isConfirmedSuperAdmin } = await import('@/lib/super-admin-shared')
      expect(isConfirmedSuperAdmin({ email: 'Boss@autoura.test', email_confirmed_at: '2026-01-01T00:00:00Z' })).toBe(true)
      expect(isConfirmedSuperAdmin({ email: 'boss@autoura.test', email_confirmed_at: null })).toBe(false)
      expect(isConfirmedSuperAdmin({ email: 'boss@autoura.test' })).toBe(false)
      expect(isConfirmedSuperAdmin({ email: 'other@autoura.test', email_confirmed_at: '2026-01-01T00:00:00Z' })).toBe(false)
      expect(isConfirmedSuperAdmin(null)).toBe(false)
    } finally {
      process.env.SUPER_ADMIN_EMAILS = prev
    }
  })

  it('every place that grants super-admin power uses the confirmed check', () => {
    for (const f of ['middleware.ts', 'lib/super-admin.ts', 'lib/supabase-server.ts', 'app/api/auth/me/route.ts']) {
      const code = codeOnly(read(f))
      expect(code, f).toContain('isConfirmedSuperAdmin(')
      expect(code, f).not.toMatch(/[^.\w]isSuperAdmin\(user\.email\)/)
    }
  })
})

describe('inviting someone is scoped to the workspace', () => {
  const body = bodyOf(read('app/api/invitations/route.ts'), 'export async function POST')

  it('rejects on membership of THIS tenant, not on global account existence', () => {
    const i = body.indexOf("from('tenant_members')")
    expect(i).toBeGreaterThan(-1)
    expect(body.slice(i, i + 220)).toContain("eq('tenant_id', tenant_id)")
  })

  it('does not refuse merely because the address has an account somewhere', () => {
    // user_profiles has no tenant_id: a hit there says nothing about whether
    // the person is a colleague.
    expect(body).not.toContain('User with this email already exists')
  })
})

describe('holding two memberships does not break the app', () => {
  // tenant_members is UNIQUE(tenant_id, user_id) — per pair. Two memberships
  // are legal, and .single() errors on 2+ rows just as it does on 0.
  const files = ['app/contexts/TenantContext.tsx', 'app/contexts/AuthContext.tsx']

  // Both ask the database which company is current (lib/current-membership):
  // one row, pinned to that company, active only — two memberships cannot
  // make the read fail or pick at random.
  it('both contexts read the current membership through the shared helper', () => {
    for (const f of files) expect(read(f), f).toMatch(/currentMembership(<[^>]*>)?\(/)
  })

  it('the helper pins one company, reads active rows, and never .single()', () => {
    const helper = read('lib/current-membership.ts')
    expect(helper).toContain("rpc('get_user_tenant_id')")
    expect(helper).toContain(".eq('tenant_id', tenantId)")
    expect(helper).toContain(".eq('status', 'active')")
    expect(helper).toContain('.maybeSingle()')
    expect(helper).not.toMatch(/\.single\(\)/)
  })
})

describe('migration 356 leaves ordinary signup alone', () => {
  const m356 = read('supabase/migrations/356_invited_signup_keeps_its_tenant.sql')
  const m343 = read('supabase/migrations/343_drop_dead_feature_flags.sql')

  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  // The signup half: from minting the tenant through seeding features.
  const signupPath = (s: string) => {
    const from = s.indexOf('INSERT INTO tenants (company_name, contact_email)')
    const to = s.indexOf('RETURN NEW;', s.indexOf('INSERT INTO tenant_features'))
    expect(from).toBeGreaterThan(-1)
    expect(to).toBeGreaterThan(from)
    return norm(s.slice(from, to))
  }

  it('reproduces 343\'s signup body verbatim', () => {
    // A new customer who gets no tenant is a worse bug than the one being
    // fixed. This is the check that says the untouched half stayed untouched.
    expect(signupPath(m356)).toBe(signupPath(m343))
  })

  it('needs BOTH a metadata flag and a real invitation before skipping it', () => {
    // The flag alone is caller-supplied (options.data is browser-controlled);
    // the invitation alone would break a normal signup by an invited person.
    const fn = m356.slice(m356.indexOf('CREATE OR REPLACE FUNCTION handle_new_user_signup'))
    const gate = fn.slice(0, fn.indexOf('INSERT INTO tenants'))
    expect(gate).toContain("raw_user_meta_data ? 'invited_to_tenant'")
    expect(gate).toContain('pending_invitation_tenant(NEW.email)')
  })

  it('grants no membership of its own', () => {
    // Only the accept route knows which token was presented, so only it knows
    // the tenant and role. A trigger matching on email could pick the wrong
    // company when two have invited the same address.
    const fn = m356.slice(
      m356.indexOf('CREATE OR REPLACE FUNCTION handle_new_user_signup'),
      m356.indexOf('-- Post-checks')
    )
    const inviteeBranch = fn.slice(0, fn.indexOf('-- ---- ordinary signup'))
    expect(inviteeBranch).not.toContain('INSERT INTO tenant_members')
  })

  it('only counts invitations that are pending, unexpired and unused', () => {
    const fn = m356.slice(
      m356.indexOf('CREATE OR REPLACE FUNCTION public.pending_invitation_tenant'),
      m356.indexOf('COMMENT ON FUNCTION')
    )
    expect(fn).toContain("ti.status = 'pending'")
    expect(fn).toContain('ti.accepted_at IS NULL')
    expect(fn).toContain('ti.expires_at > NOW()')
  })
})
