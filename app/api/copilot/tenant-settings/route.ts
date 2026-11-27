// ============================================
// GET   /api/copilot/tenant-settings — read tenant copilot flags (admin only)
// PATCH /api/copilot/tenant-settings — update flags (admin only)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { MAX_TENANT_SYSTEM_PROMPT_CHARS } from '@/lib/copilot-suggest'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, role } = auth

  const { data, error } = await supabase
    .from('tenant_features')
    .select('copilot_pregenerate_enabled, whatsapp_ai_enabled, copilot_system_prompt')
    .eq('tenant_id', tenant_id)
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    role,
    features: {
      copilot_pregenerate_enabled: !!data?.copilot_pregenerate_enabled,
      whatsapp_ai_enabled: !!data?.whatsapp_ai_enabled,
      copilot_system_prompt: data?.copilot_system_prompt ?? '',
    },
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, role } = auth

  if (!['owner', 'admin'].includes(role || '')) {
    return NextResponse.json({ success: false, error: 'Only admins can change copilot settings' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, any> = {}
  if (typeof body.copilot_pregenerate_enabled === 'boolean') patch.copilot_pregenerate_enabled = body.copilot_pregenerate_enabled
  if (typeof body.whatsapp_ai_enabled === 'boolean') patch.whatsapp_ai_enabled = body.whatsapp_ai_enabled
  // The company's own email-copilot prompt (migration 474). Blank = the built-in prompt.
  if (typeof body.copilot_system_prompt === 'string') {
    if (body.copilot_system_prompt.length > MAX_TENANT_SYSTEM_PROMPT_CHARS) {
      return NextResponse.json({ success: false, error: `The system prompt is too long (over ${MAX_TENANT_SYSTEM_PROMPT_CHARS.toLocaleString('en-US')} characters)` }, { status: 400 })
    }
    patch.copilot_system_prompt = body.copilot_system_prompt.trim() ? body.copilot_system_prompt : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
  }
  // The same platform checks as WhatsApp settings: switched on here without
  // them, the switch showed On while the webhook ignored it.
  if (patch.whatsapp_ai_enabled === true && (!process.env.ANTHROPIC_API_KEY || process.env.WHATSAPP_AI_ENABLED !== 'true')) {
    return NextResponse.json({ success: false, error: 'WhatsApp auto-reply is not available on this platform yet — contact Autoura support' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tenant_features')
    .update(patch)
    .eq('tenant_id', tenant_id)
    .select('copilot_pregenerate_enabled, whatsapp_ai_enabled, copilot_system_prompt')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, features: { ...data, copilot_system_prompt: data?.copilot_system_prompt ?? '' } })
}
