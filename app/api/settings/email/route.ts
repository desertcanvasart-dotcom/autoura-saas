import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { currentTenantId, type MembershipDb } from '@/lib/current-membership'

// Reports the Gmail connection status for the Settings → Email tab.
//
// This route used to also read/write a per-user `user_settings.email_settings`
// blob (signature, auto-reply). Those were dead settings: no send path ever
// read the signature (signatures live in email_signatures, managed at
// /settings/email?tab=signatures) and no auto-reply engine ever consumed the
// toggle — the UI promised behavior that did not exist. The PUT and the dead
// fields were removed 2026-07-29 along with the tab's controls.

// GET - Gmail connection status for the current user's tenant
export async function GET(_request: NextRequest) {
  try {
    // Authenticated client — RLS scopes every query to the caller's tenant
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // This person's mailbox in the company they are working in — one per
    // company since migration 415. (It used to fall back to "any visible
    // mailbox", which after switching showed another company's address.)
    const { tenantId } = await currentTenantId(supabase as unknown as MembershipDb)
    let tokenData: { email?: string | null } | null = null
    if (tenantId) {
      const { data: userToken } = await supabase
        .from('gmail_tokens')
        .select('email, updated_at')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (userToken) tokenData = userToken
    }

    const gmailEmail = String(tokenData?.email || '')

    return NextResponse.json({
      gmail_connected: !!gmailEmail,
      gmail_email: gmailEmail,
    })
  } catch (error) {
    console.error('Error fetching email settings:', error)
    return NextResponse.json({ gmail_connected: false, gmail_email: '' })
  }
}
