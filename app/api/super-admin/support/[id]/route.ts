// One support conversation, super-admin side: read it, reply as platform
// support, open/close it. Replies also notify the tenant by email so the
// answer reaches them even with the widget closed — email failure is
// reported (notified: false), never silently swallowed.

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { sendMail } from '@/lib/email-send'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!

    const { data: conversation, error: convError } = await admin
      .from('support_conversations')
      .select('id, tenant_id, status, created_at, last_message_at, tenant:tenants(company_name, contact_email)')
      .eq('id', id)
      .maybeSingle()
    if (convError) throw convError
    if (!conversation) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    const { data: messages, error: msgError } = await admin
      .from('support_messages')
      .select('id, sender_type, body, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(500)
    if (msgError) throw msgError

    return NextResponse.json({ success: true, conversation, messages: messages || [] })
  } catch (error) {
    console.error('Super-admin support GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!

    const { body } = await request.json()
    const text = typeof body === 'string' ? body.trim() : ''
    if (!text) {
      return NextResponse.json({ success: false, error: 'Message body is required' }, { status: 400 })
    }
    if (text.length > 8000) {
      return NextResponse.json({ success: false, error: 'Message too long (max 8000 characters)' }, { status: 400 })
    }

    const { data: conversation, error: convError } = await admin
      .from('support_conversations')
      .select('id, tenant_id, tenant:tenants(company_name, contact_email)')
      .eq('id', id)
      .maybeSingle()
    if (convError) throw convError
    if (!conversation) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    const { data: message, error: msgError } = await admin
      .from('support_messages')
      .insert({
        conversation_id: id,
        tenant_id: conversation.tenant_id,
        sender_type: 'support',
        body: text,
      })
      .select('id, sender_type, body, created_at')
      .single()
    if (msgError) throw msgError

    await admin
      .from('support_conversations')
      .update({ last_message_at: new Date().toISOString(), status: 'open' })
      .eq('id', id)

    // Email the tenant so the reply reaches them with the widget closed.
    let notified = false
    const tenant = conversation.tenant as { company_name?: string; contact_email?: string } | null
    if (tenant?.contact_email) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://getautoura.net').replace(/\/$/, '')
      const result = await sendMail({
        to: tenant.contact_email,
        subject: 'Autoura support replied to your message',
        html:
          `<p>Our team replied in your support chat:</p>` +
          `<blockquote>${escapeHtml(text).replace(/\n/g, '<br>')}</blockquote>` +
          `<p><a href="${appUrl}/dashboard">Open Autoura</a> and click the chat bubble to continue the conversation.</p>`,
      }).catch((e) => ({ success: false as const, error: String(e) }))
      notified = !!(result as { success?: boolean }).success
      if (!notified) console.error('Support reply email failed:', (result as { error?: unknown }).error)
    }

    return NextResponse.json({ success: true, message, notified })
  } catch (error) {
    console.error('Super-admin support POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!

    const { status } = await request.json()
    if (!['open', 'closed'].includes(status)) {
      return NextResponse.json({ success: false, error: "status must be 'open' or 'closed'" }, { status: 400 })
    }

    const { error } = await admin
      .from('support_conversations')
      .update({ status })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true, status })
  } catch (error) {
    console.error('Super-admin support PATCH error:', error)
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
