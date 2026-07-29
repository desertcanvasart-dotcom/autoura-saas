import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

// Reports the Gmail connection status for the Settings → Email tab.
//
// This route used to also read/write a per-user `user_settings.email_settings`
// blob (signature, auto-reply). Those were dead settings: no send path ever
// read the signature (signatures live in email_signatures, managed at
// /settings/email-signatures) and no auto-reply engine ever consumed the
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

    // Actual Gmail connection from gmail_tokens (RLS-scoped to this tenant).
    // Prefer this user's token, then fall back to the tenant's most recent.
    // The OAuth callback writes the connected address to `email` (the live
    // column); migration 007's `email_address` was stale. Read `email`.
    let tokenData: { email?: string | null } | null = null

    const { data: userToken } = await supabase
      .from('gmail_tokens')
      .select('email, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (userToken) tokenData = userToken

    if (!tokenData) {
      const { data: anyToken } = await supabase
        .from('gmail_tokens')
        .select('email, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (anyToken) tokenData = anyToken
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
