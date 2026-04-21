// ============================================
// GET   /api/copilot/settings — fetch current user's copilot settings
// PATCH /api/copilot/settings — update tone (and future fields)
// Per-user, tenant-scoped. Auto-creates the row if missing.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

type Tone = 'professional' | 'friendly' | 'formal'
const TONES: Tone[] = ['professional', 'friendly', 'formal']

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, user } = auth

  const { data } = await supabase
    .from('copilot_settings')
    .select('tone, created_at, updated_at')
    .eq('tenant_id', tenant_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (data) {
    return NextResponse.json({ success: true, settings: data })
  }

  // Auto-create with defaults
  const { data: created, error } = await supabase
    .from('copilot_settings')
    .insert({ tenant_id, user_id: user.id, tone: 'professional' })
    .select('tone, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ success: true, settings: { tone: 'professional' } })
  }

  return NextResponse.json({ success: true, settings: created })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, user } = auth

  const body = await request.json().catch(() => ({}))
  const tone: Tone | undefined = body.tone

  if (!tone || !TONES.includes(tone)) {
    return NextResponse.json({ success: false, error: `tone must be one of ${TONES.join(', ')}` }, { status: 400 })
  }

  // Upsert pattern: row is keyed by (tenant_id, user_id)
  const { data: existing } = await supabase
    .from('copilot_settings')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await supabase
      .from('copilot_settings')
      .update({ tone })
      .eq('id', existing.id)
      .select('tone, updated_at')
      .single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, settings: data })
  }

  const { data, error } = await supabase
    .from('copilot_settings')
    .insert({ tenant_id, user_id: user.id, tone })
    .select('tone, updated_at')
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, settings: data })
}
