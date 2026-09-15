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

describe('an invitee is never asked to confirm an email', () => {
  it('the account is created server-side, already confirmed', () => {
    const body = bodyOf(read('app/api/invitations/accept/route.ts'), 'export async function POST')
    expect(body).toContain('email_confirm: true')
  })

  it('the invite page does not sign the user up from the browser', () => {
    // signUp() with confirmation on creates an account that cannot log in and
    // cannot be recreated — the invitee is stranded with no way forward.
    const page = read('app/invite/accept/page.tsx')
    expect(codeOnly(page).match(/supabase\.auth\.signUp\(/)).toBeNull()
    expect(page).toContain("fetch('/api/invitations/accept'")
  })

  it('never signs in with the typed password for an existing account', () => {
    const page = read('app/invite/accept/page.tsx')
    const i = page.indexOf('needs_existing_password')
    const j = page.indexOf('signInWithPassword')
    expect(i).toBeGreaterThan(-1)
    expect(j).toBeGreaterThan(-1)
    expect(i).toBeLessThan(j) // the early return guards the sign-in
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

  it('neither context reads memberships with .single()', () => {
    for (const f of files) {
      const src = read(f)
      const i = src.indexOf("from('tenant_members')")
      expect(i, f).toBeGreaterThan(-1)
      const query = src.slice(i, i + 400)
      expect(query, f).not.toMatch(/\.single\(\)/)
      expect(query, f).toContain('maybeSingle()')
    }
  })

  it('both pick deterministically and ignore non-active memberships', () => {
    for (const f of files) {
      const src = read(f)
      const query = src.slice(src.indexOf("from('tenant_members')"), src.indexOf("from('tenant_members')") + 400)
      expect(query, f).toContain("eq('status', 'active')")
      expect(query, f).toContain('.limit(1)')
    }
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
