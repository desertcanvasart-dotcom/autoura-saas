import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// Adapted from travel-ops-pro. Differences from the sibling:
//  - Uses our per-user user_settings model (scoped by user_id) instead of a
//    singleton `id = 'default'` row.
//  - Uses the authenticated (RLS-scoped) client instead of the service role,
//    so the gmail_tokens lookup is automatically confined to the caller's tenant.
//  - Reads gmail_tokens.email_address (our column name).

// GET - Fetch email settings for the current user
export async function GET(_request: NextRequest) {
  try {
    // Authenticated client — RLS scopes every query to the caller's tenant
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Saved email settings (per-user row)
    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('email_settings')
      .eq('user_id', user.id)
      .maybeSingle()

    const emailSettings = (settingsData?.email_settings as Record<string, unknown>) || {}

    // Actual Gmail connection from gmail_tokens (RLS-scoped to this tenant).
    // Prefer this user's token, then fall back to the tenant's most recent.
    let tokenData: { email_address?: string | null } | null = null

    const { data: userToken } = await supabase
      .from('gmail_tokens')
      .select('email_address, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (userToken) tokenData = userToken

    if (!tokenData) {
      const { data: anyToken } = await supabase
        .from('gmail_tokens')
        .select('email_address, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (anyToken) tokenData = anyToken
    }

    const gmailEmail = String(tokenData?.email_address || '')
    const gmailConnected = !!gmailEmail

    return NextResponse.json({
      gmail_connected: gmailConnected,
      gmail_email: gmailEmail,
      signature: emailSettings.signature || '',
      auto_reply_enabled: emailSettings.auto_reply_enabled || false,
      auto_reply_message: emailSettings.auto_reply_message || ''
    })
  } catch (error) {
    console.error('Error fetching email settings:', error)
    return NextResponse.json({
      gmail_connected: false,
      gmail_email: '',
      signature: '',
      auto_reply_enabled: false,
      auto_reply_message: ''
    })
  }
}

// PUT - Update email settings for the current user
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed' },
        { status: authResult.status || 401 }
      )
    }

    const { supabase, user } = authResult
    const settings = await request.json()

    const validSettings = {
      gmail_connected: Boolean(settings.gmail_connected),
      gmail_email: settings.gmail_email || '',
      signature: settings.signature || '',
      auto_reply_enabled: Boolean(settings.auto_reply_enabled),
      auto_reply_message: settings.auto_reply_message || ''
    }

    // Upsert the per-user row; onConflict targets the UNIQUE(user_id) constraint
    // so existing notification_preferences on the same row are preserved.
    const { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          email_settings: validSettings,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Error saving email settings:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to save email settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: validSettings
    })
  } catch (error) {
    console.error('Error updating email settings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save email settings' },
      { status: 500 }
    )
  }
}
