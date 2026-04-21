// ============================================
// PATCH  /api/email/signatures/[id] — update name / content / is_default
// DELETE /api/email/signatures/[id]
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, user } = auth
  const { id } = await params

  const body = await request.json().catch(() => ({}))

  const { data: existing } = await supabase
    .from('email_signatures')
    .select('id, tenant_id, user_id')
    .eq('id', id)
    .single()

  if (!existing || existing.tenant_id !== tenant_id || existing.user_id !== user.id) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  const patch: Record<string, any> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.content === 'string' && body.content.trim()) patch.content = body.content.trim()

  if (typeof body.is_default === 'boolean') {
    patch.is_default = body.is_default
    if (body.is_default) {
      // Clear any other default for this user
      await supabase
        .from('email_signatures')
        .update({ is_default: false })
        .eq('tenant_id', tenant_id)
        .eq('user_id', user.id)
        .neq('id', id)
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('email_signatures')
    .update(patch)
    .eq('id', id)
    .select('id, name, content, is_default, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, signature: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id, user } = auth
  const { id } = await params

  const { error } = await supabase
    .from('email_signatures')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
