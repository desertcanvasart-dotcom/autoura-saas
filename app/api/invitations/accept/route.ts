import { gateStructural } from '@/lib/usage-enforcement'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sendPasswordSetupEmail, unusablePassword } from '@/lib/invitation-setup-email'

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
 * The token does NOT prove the mailbox. The inviter is handed the same link
 * (to copy when the email fails, and on every resend), so whoever opens it may
 * not be the invitee. This route therefore never chooses a password and never
 * confirms an address:
 *   - no account yet: one is created UNCONFIRMED with a random password nobody
 *     knows, and the invitee's own inbox gets a one-time "set your password"
 *     link (lib/invitation-setup-email.ts) — opening it confirms the address;
 *   - an unconfirmed account: left exactly as it is, and sent the same link;
 *   - a working account: only the membership is added.
 * It used to create the account confirmed with the password typed on the form,
 * and to overwrite an unconfirmed account's password — so anyone holding the
 * link (the inviter included) could own the invitee's address, and an address
 * on the super-admin allowlist with it.
 */

type AcceptAction = 'created' | 'unconfirmed_existing' | 'linked_existing'

export async function POST(request: NextRequest) {
  try {
    const { token, full_name, accepted_terms } = await request.json()

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
      .select('id')
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
      // When this person agreed to the Terms and Privacy Policy, recorded by
      // the server (not a browser clock), as for /signup.
      ...(accepted_terms === true ? { terms_accepted_at: new Date().toISOString() } : {}),
    }

    if (!userId && accepted_terms !== true) {
      return NextResponse.json(
        { success: false, error: 'Please agree to the Terms of Service and Privacy Policy to continue' },
        { status: 400 }
      )
    }

    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: unusablePassword(),
        email_confirm: false,
        user_metadata: userMetadata,
      })

      if (createError || !created?.user) {
        // An auth user with no profile row — rare. Never touch it; send them
        // to sign in instead.
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
      // Unconfirmed: nothing about the account changes here — no password,
      // no confirmation. The setup email below lets the mailbox's owner in.
      // Confirmed: add the membership and touch NOTHING else — an invitation
      // link must never be a way to reset a live password.
      action = existing?.user && !existing.user.email_confirmed_at ? 'unconfirmed_existing' : 'linked_existing'
    }

    // ---- 3. The membership — the part that was missing entirely -----------
    // Still a seat free? Invitations made before the plan shrank, or several
    // accepted at once, could take the company over its limit.
    const seatGate = await gateStructural(db, invitation.tenant_id, 'seats', 'team members')
    if (!seatGate.ok) {
      return NextResponse.json(
        { success: false, error: 'This company has no free seats on its plan. Ask whoever invited you to free a seat or upgrade, then use the link again.' },
        { status: 403 }
      )
    }

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

    // ---- 3b. The invitee's own mailbox finishes it ------------------------
    if (action !== 'linked_existing') {
      const setup = await sendPasswordSetupEmail(admin as any, email, tenant?.company_name ?? null)
      if (!setup.ok) {
        console.error('Invitation accepted but the setup email failed:', setup.error)
        // A new account nobody can reach is worse than none: undo it so the
        // link can be used again. An existing account keeps its membership —
        // "Forgot password" on the sign-in page lets its owner in.
        if (action === 'created' && userId) {
          const { error: undoError } = await db.from('tenant_members').delete().eq('tenant_id', invitation.tenant_id).eq('user_id', userId)
          if (undoError) console.error('Could not undo the membership after the setup email failed:', undoError)
          await admin.auth.admin.deleteUser(userId)
          return NextResponse.json(
            { success: false, error: 'We could not email you the link to set your password. Please try again in a few minutes.' },
            { status: 502 }
          )
        }
      }
    }

    // ---- 4. The profile's display fields ----------------------------------
    // No role here any more: tenant_members.role is the single source of
    // permissions (lib/roles.ts), so the membership inserted above IS the
    // grant. This used to write a max(existing, invited) profile role to avoid
    // downgrading someone who administers another workspace — an artefact of
    // one global role per account, which no longer decides anything.
    const profileUpdate: Record<string, unknown> = {
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
      // Not fatal: the membership is what grants access, and it exists.
      console.error('Membership created but profile details not updated:', profileError)
    }

    // ---- 4b. Open the company just joined ----------------------------------
    // Someone already working in another company lands in this one; the
    // sidebar's company switcher takes them back. Separate from the update
    // above so a database without migration 414 still saves the name.
    if (action !== 'created') {
      const { error: activeError } = await db
        .from('user_profiles')
        .update({ active_tenant_id: invitation.tenant_id })
        .eq('id', userId)
      if (activeError) console.error('Joined, but could not make the new company current:', activeError)
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
        // 'linked_existing' signs in with the password it already has.
        needs_existing_password: action === 'linked_existing',
        // Everyone else sets a password from the link in their inbox.
        check_email: action !== 'linked_existing',
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
