// ============================================
// GET   /api/copilot/tenant-settings — read tenant copilot flags (admin only)
// PATCH /api/copilot/tenant-settings — update flags (admin only)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, role } = auth

  const { data, error } = await supabase
    .from('tenant_features')
    .select('copilot_pregenerate_enabled, whatsapp_ai_enabled')
    .eq('tenant_id', tenant_id)
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    role,
    features: {
      copilot_pregenerate_enabled: !!data?.copilot_pregenerate_enabled,
      whatsapp_ai_enabled: !!data?.whatsapp_ai_enabled,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, role } = auth

  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Only admins can change copilot settings' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, any> = {}
  if (typeof body.copilot_pregenerate_enabled === 'boolean') patch.copilot_pregenerate_enabled = body.copilot_pregenerate_enabled
  if (typeof body.whatsapp_ai_enabled === 'boolean') patch.whatsapp_ai_enabled = body.whatsapp_ai_enabled

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tenant_features')
    .update(patch)
    .eq('tenant_id', tenant_id)
    .select('copilot_pregenerate_enabled, whatsapp_ai_enabled')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, features: data })
}
