// Send a support message as the tenant. Creates the conversation on first
// message (get-or-create newest open thread), appends via the RLS client —
// migration 261's WITH CHECK pins sender_type='tenant' and sender_user_id to
// the caller, so this route cannot forge platform replies even if buggy.
//
// The platform is notified by email (Resend). Per the PR #101 lesson, email
// failure is REPORTED to the caller (notified: false), never silently
// swallowed — the message itself still lands, chat is the source of truth.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { sendMail } from '@/lib/email-send'

function supportInboxAddress(): string | null {
  const admins = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return admins[0] || process.env.BUSINESS_EMAIL || null
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id, user } = authResult
    if (!supabase || !tenant_id || !user) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const { body } = await request.json()
    const text = typeof body === 'string' ? body.trim() : ''
    if (!text) {
      return NextResponse.json({ success: false, error: 'Message body is required' }, { status: 400 })
    }
    if (text.length > 8000) {
      return NextResponse.json({ success: false, error: 'Message too long (max 8000 characters)' }, { status: 400 })
    }

    // Get-or-create the open thread.
    let { data: conversation } = await supabase
      .from('support_conversations')
      .select('id')
      .eq('status', 'open')
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!conversation) {
      const { data: created, error: createError } = await supabase
        .from('support_conversations')
        .insert({ tenant_id, created_by: user.id })
        .select('id')
        .single()
      if (createError) {
        return NextResponse.json({ success: false, error: createError.message }, { status: 500 })
      }
      conversation = created
    }

    const { data: message, error: msgError } = await supabase
      .from('support_messages')
      .insert({
        conversation_id: conversation.id,
        tenant_id,
        sender_type: 'tenant',
        sender_user_id: user.id,
        body: text,
      })
      .select('id, sender_type, body, created_at')
      .single()
    if (msgError) {
      return NextResponse.json({ success: false, error: msgError.message }, { status: 500 })
    }

    await supabase
      .from('support_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id)

    // Notify the platform. Failure is reported, not fatal.
    let notified = false
    const inbox = supportInboxAddress()
    if (inbox) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('company_name, contact_email')
        .eq('id', tenant_id)
        .maybeSingle()
      const from = tenant?.company_name || tenant?.contact_email || tenant_id
      const result = await sendMail({
        to: inbox,
        subject: `Support: new message from ${from}`,
        html:
          `<p><strong>${escapeHtml(from)}</strong> wrote in support chat:</p>` +
          `<blockquote>${escapeHtml(text).replace(/\n/g, '<br>')}</blockquote>` +
          `<p><a href="${(process.env.NEXT_PUBLIC_APP_URL || 'https://getautoura.net').replace(/\/$/, '')}/super-admin/support">Reply in the support inbox</a></p>`,
      }).catch((e) => ({ success: false as const, error: String(e) }))
      notified = !!(result as { success?: boolean }).success
      if (!notified) console.error('Support notify email failed:', (result as { error?: unknown }).error)
    }

    return NextResponse.json({ success: true, message, conversationId: conversation.id, notified })
  } catch (error) {
    console.error('Support message POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
