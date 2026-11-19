import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import {
  FOLLOW_UP_LANGUAGES,
  isContentSid,
  isFollowUpLanguage,
  readFollowUpTemplates,
  withFollowUpTemplates,
} from '@/lib/whatsapp-templates'
import { fetchTwilioTemplate } from '@/lib/whatsapp-templates-twilio'

// ============================================
// The company's WhatsApp follow-up templates (lib/whatsapp-templates.ts)
// ============================================
// GET → the saved template per language (EN/ES/JA), each with WhatsApp's
//       current approval read from Twilio.
// PUT { language, contentSid } — owners and admins. The ID is checked in
//       Twilio: it must exist and be APPROVED for WhatsApp; its approved text
//       is stored beside it. contentSid null/"" removes that language.

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { data } = await supabase.from('tenants').select('settings').eq('id', tenant_id).maybeSingle()
  const saved = readFollowUpTemplates(data?.settings)
  const templates = await Promise.all(
    FOLLOW_UP_LANGUAGES.map(async (language) => {
      const t = saved[language]
      if (!t) return { language, contentSid: null, body: null, approval: null }
      const live = await fetchTwilioTemplate(t.contentSid).catch(() => null)
      return { language, contentSid: t.contentSid, body: t.body, approval: live?.approval ?? 'unknown' }
    })
  )
  return NextResponse.json({ success: true, data: { templates } })
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'admin')
  if (denied) return denied
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (!isFollowUpLanguage(body.language)) {
    return NextResponse.json({ success: false, error: `Language must be one of ${FOLLOW_UP_LANGUAGES.join(', ')}` }, { status: 400 })
  }
  const raw = typeof body.contentSid === 'string' ? body.contentSid.trim() : ''

  const { data: current, error: readError } = await supabase.from('tenants').select('settings').eq('id', tenant_id).maybeSingle()
  if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 })
  const templates = readFollowUpTemplates(current?.settings)

  if (!raw) {
    delete templates[body.language as keyof typeof templates]
  } else {
    if (!isContentSid(raw)) {
      return NextResponse.json({ success: false, error: 'A Twilio template ID starts with HX and has 34 characters.' }, { status: 400 })
    }
    let info
    try {
      info = await fetchTwilioTemplate(raw)
    } catch {
      return NextResponse.json({ success: false, error: 'Twilio has no template with this ID.' }, { status: 400 })
    }
    if (info.approval !== 'approved') {
      const why = info.rejectionReason ? ` (${info.rejectionReason})` : ''
      return NextResponse.json({
        success: false,
        error: `WhatsApp has not approved this template yet: it is "${info.approval}"${why}. Save it once it shows approved in Twilio.`,
      }, { status: 400 })
    }
    if (!info.body.trim()) {
      return NextResponse.json({ success: false, error: 'This template has no text Autoura can send.' }, { status: 400 })
    }
    templates[body.language as keyof typeof templates] = { contentSid: raw, body: info.body }
  }

  const { error } = await supabase
    .from('tenants')
    .update({ settings: withFollowUpTemplates(current?.settings, templates) as never })
    .eq('id', tenant_id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { language: body.language, template: templates[body.language as keyof typeof templates] ?? null } })
}
