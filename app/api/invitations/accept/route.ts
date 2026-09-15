import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

/**
 * POST /api/invitations/accept — turn an invitation into a real membership.
 *
 * TOKEN-GATED, not session-gated: the person accepting has no account yet, so
 * the secret invitation token IS the credential. This lives on its own path
 * because the middleware allowlist matches by PATH, not method — beside the
 * session-gated GET/POST/DELETE it could not be allowlisted without exposing
 * them.
 *
 * This route owns the whole acceptance, because it is the only place that
 * knows WHICH invitation was presented. The signup trigger sees only an email
 * address, and two companies may have invited the same one; it therefore
 * creates no membership at all (356) and defers to this route.
 *
 * The account is created HERE, server-side, with email_confirm: true rather
 * than by supabase.auth.signUp() in the browser. Possession of an unguessable
 * token already proves control of the mailbox, so a second confirmation email
 * proves nothing and strands anyone who misses it: the account exists (so
 * signing up again says "already registered") but every login fails.
 */

// tenant_members.role is per-membership; user_profiles.role is what the UI and
// middleware actually enforce (227). The invited role has to reach both, or an
// invited manager lands with a stripped sidebar and 403s.
const PROFILE_ROLE: Record<string, string> = {
  owner: 'admin',
  admin: 'admin',
  manager: 'manager',
  member: 'member',
  viewer: 'viewer',
}

// Used only to avoid DOWNGRADING someone who already holds a higher profile
// role — see the note where it is applied.
const ROLE_RANK: Record<string, number> = {
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
}

type AcceptAction = 'created' | 'confirmed_existing' | 'linked_existing'

export async function POST(request: NextRequest) {
  try {
    const { token, password, full_name } = await request.json()

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const db = admin as any

    // ---- 1. The invitation ------------------------------------------------
    // Read, don't consume: the invitation is only marked accepted once the
    // membership actually exists (step 5). Marking it first is how the old
    // flow reported success while leaving the invitee in no company at all.
    // The conditions ARE the authorization — a token failing any of them is
    // indistinguishable from a wrong one.
    const { data: invitation } = await db
      .from('tenant_invitations')
      .select('id, tenant_id, email, role')
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found, expired, or already used' },
        { status: 404 }
      )
    }

    const email = String(invitation.email).toLowerCase()

    const { data: tenant } = await db
      .from('tenants')
      .select('company_name')
      .eq('id', invitation.tenant_id)
      .maybeSingle()

    // ---- 2. Does this person already have an account? ---------------------
    // The signup trigger writes a user_profiles row on both its paths, so a
    // profile is a reliable proxy for an auth user, and unlike auth.users it
    // is reachable through PostgREST.
    const { data: existingProfile } = await db
      .from('user_profiles')
      .select('id, role')
      .eq('email', email)
      .maybeSingle()

    let userId: string | null = existingProfile?.id ?? null
    let action: AcceptAction

    // Metadata the signup trigger reads to know this is an invitee and must
    // not be given a company of their own. It is a request, never a proof —
    // 356 also requires a real pending invitation before honouring it.
    const userMetadata = {
      full_name: full_name || '',
      invited_to_tenant: invitation.tenant_id,
    }

    if (!userId) {
      if (!password || String(password).length < 8) {
        return NextResponse.json(
          { success: false, error: 'A password of at least 8 characters is required' },
          { status: 400 }
        )
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      })

      if (createError || !created?.user) {
        // An auth user with no profile row — rare, but never guess a password
        // onto it. Send them to sign in instead.
        return NextResponse.json(
          {
            success: false,
            error: 'An account already exists for this address. Please sign in, then open the invitation link again.',
          },
          { status: 409 }
        )
      }

      userId = created.user.id
      action = 'created'
    } else {
      const { data: existing } = await admin.auth.admin.getUserById(userId)

      if (existing?.user && !existing.user.email_confirmed_at) {
        // Stranded by the old browser-side signUp: the account exists but was
        // never confirmed, so they can neither log in nor sign up again. The
        // token proves the mailbox, so confirm it and set the password they
        // just chose.
        if (!password || String(password).length < 8) {
          return NextResponse.json(
            { success: false, error: 'A password of at least 8 characters is required' },
            { status: 400 }
          )
        }

        const { error: repairError } = await admin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        })

        if (repairError) {
          return NextResponse.json(
            { success: false, error: 'Could not complete your account. Please contact whoever invited you.' },
            { status: 500 }
          )
        }

        action = 'confirmed_existing'
      } else {
        // A working account. Add the membership and touch NOTHING else — an
        // invitation link must never be a way to reset a live password.
        action = 'linked_existing'
      }
    }

    // ---- 3. The membership — the part that was missing entirely -----------
    const { error: memberError } = await db
      .from('tenant_members')
      .insert({
        tenant_id: invitation.tenant_id,
        user_id: userId,
        role: invitation.role,
        status: 'active',
        joined_at: new Date().toISOString(),
      })

    // 23505: already a member. Re-accepting is a no-op, not a failure.
    if (memberError && memberError.code !== '23505') {
      // A brand-new account with no membership is worse than no account: it
      // can log in and see nothing, and blocks a retry. Undo it.
      if (action === 'created' && userId) {
        await admin.auth.admin.deleteUser(userId)
      }
      console.error('Error creating tenant membership:', memberError)
      return NextResponse.json(
        { success: false, error: 'Could not add you to the workspace. Please contact whoever invited you.' },
        { status: 500 }
      )
    }

    // ---- 4. The profile role the UI actually reads ------------------------
    // max(existing, invited): one profile carries one role for the whole app,
    // so writing the invited role flat would DOWNGRADE someone who already
    // administers another workspace. (227 notes the single-role design as a
    // known wart; this keeps it from biting.)
    const invitedProfileRole = PROFILE_ROLE[invitation.role] ?? 'member'
    const currentRank = ROLE_RANK[existingProfile?.role ?? ''] ?? 0
    const profileRole =
      currentRank > (ROLE_RANK[invitedProfileRole] ?? 0)
        ? existingProfile!.role
        : invitedProfileRole

    const profileUpdate: Record<string, unknown> = {
      role: profileRole,
      updated_at: new Date().toISOString(),
    }
    // Only name the company for someone who has just joined their first one.
    if (action !== 'linked_existing' && tenant?.company_name) {
      profileUpdate.company_name = tenant.company_name
    }
    if (full_name) profileUpdate.full_name = full_name

    const { error: profileError } = await db
      .from('user_profiles')
      .update(profileUpdate)
      .eq('id', userId)

    if (profileError) {
      // Not fatal: they are a member, they can sign in. Permissions may read
      // low until an admin corrects the role, so make it loud in the logs.
      console.error('Membership created but profile role not set:', profileError)
    }

    // ---- 5. Now the invitation is genuinely used --------------------------
    await db
      .from('tenant_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)
      .is('accepted_at', null)

    return NextResponse.json({
      success: true,
      data: {
        action,
        email,
        company_name: tenant?.company_name ?? null,
        // 'linked_existing' keeps its own password, so the browser cannot sign
        // in with whatever was typed on the invite form.
        needs_existing_password: action === 'linked_existing',
      },
    })
  } catch (error) {
    console.error('Error accepting invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to accept invitation' },
      { status: 500 }
    )
  }
}
