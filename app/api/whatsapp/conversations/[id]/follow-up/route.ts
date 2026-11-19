import { NextRequest, NextResponse } from 'next/server'
import { sendGuard } from '@/lib/send-guard'
import { requireAuth } from '@/lib/supabase-server'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'
import {
  FOLLOW_UP_LANGUAGES,
  fillTemplate,
  isFollowUpLanguage,
  readFollowUpTemplates,
  templateVariables,
  windowState,
} from '@/lib/whatsapp-templates'

// ============================================
// Follow up a conversation whose 24-hour window has closed
// ============================================
// GET  → { window, templates }: whether a free message can go now (from the
//        customer's last message on this conversation) and which follow-up
//        templates the company has (lib/whatsapp-templates.ts).
// POST { language } → sends that approved template. Once the customer
//        replies, the window is open again and normal messages work.

async function lastInboundAt(
  supabase: NonNullable<Awaited<ReturnType<typeof requireAuth>>['supabase']>,
  conversationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { created_at?: string } | null)?.created_at ?? null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params

  const { data: conv } = await supabase.from('whatsapp_conversations').select('id').eq('id', id).maybeSingle()
  if (!conv) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })

  const [last, tenant] = await Promise.all([
    lastInboundAt(supabase, id),
    supabase.from('tenants').select('settings').eq('id', tenant_id).maybeSingle(),
  ])
  const saved = readFollowUpTemplates(tenant.data?.settings)
  return NextResponse.json({
    success: true,
    data: {
      window: windowState(last),
      templates: FOLLOW_UP_LANGUAGES.filter(l => saved[l]).map(l => ({ language: l, body: saved[l]!.body })),
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sendGate = await sendGuard('messaging')
  if (sendGate) return sendGate
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  if (!isFollowUpLanguage(body.language)) {
    return NextResponse.json({ success: false, error: `Choose a language: ${FOLLOW_UP_LANGUAGES.join(', ')}` }, { status: 400 })
  }

  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .select('id, phone_number, client_name')
    .eq('id', id)
    .maybeSingle()
  if (!conv) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })

  const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenant_id).maybeSingle()
  const template = readFollowUpTemplates(tenant?.settings)[body.language as keyof ReturnType<typeof readFollowUpTemplates>]
  if (!template) {
    return NextResponse.json({ success: false, error: 'No approved follow-up template for this language. Add one in Settings → WhatsApp.' }, { status: 400 })
  }

  const firstName = String((conv as { client_name?: string | null }).client_name ?? '').trim().split(/\s+/)[0] || null
  const variables = templateVariables(template.body, { clientFirstName: firstName })
  if (!variables) {
    return NextResponse.json({ success: false, error: "This template needs the client's name. Add it to the conversation first." }, { status: 400 })
  }
  const text = fillTemplate(template.body, variables)
  const to = String((conv as { phone_number: string }).phone_number)

  const sent = await sendWhatsAppTemplate({
    to: to.startsWith('+') ? to : `+${to}`,
    contentSid: template.contentSid,
    variables,
    text,
    tenantId: tenant_id,
    statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'}/api/whatsapp/status-callback`,
  })
  if (!sent.success || !sent.messageId) {
    return NextResponse.json({ success: false, error: sent.error || 'WhatsApp did not accept the template' }, { status: 502 })
  }

  const { data: saved, error } = await supabase
    .from('whatsapp_messages')
    .insert({
      tenant_id,
      conversation_id: id,
      message_sid: sent.messageId,
      direction: 'outbound',
      message_body: text,
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_by: auth.user!.id,
      metadata: { template: 'follow_up', language: body.language, content_sid: template.contentSid },
    })
    .select()
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  await supabase
    .from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ success: true, message: saved })
}
