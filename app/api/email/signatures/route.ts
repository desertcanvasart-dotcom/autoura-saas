// ============================================
// GET   /api/email/signatures — list signatures for the current user+tenant
// POST  /api/email/signatures — create new signature
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, user } = auth

  const { data, error } = await supabase
    .from('email_signatures')
    .select('id, name, content, is_default, created_at, updated_at')
    .eq('tenant_id', tenant_id)
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, signatures: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, user } = auth

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name || '').trim()
  const content: string = (body.content || '').trim()
  const isDefault: boolean = !!body.is_default

  if (!name || !content) {
    return NextResponse.json({ success: false, error: 'name and content are required' }, { status: 400 })
  }

  if (isDefault) {
    await supabase
      .from('email_signatures')
      .update({ is_default: false })
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
  }

  const { data, error } = await supabase
    .from('email_signatures')
    .insert({ tenant_id, user_id: user.id, name, content, is_default: isDefault })
    .select('id, name, content, is_default, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, signature: data })
}
