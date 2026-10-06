// ============================================
// /api/day-blocks/[id] — switch a block on or off, or remove it
// ============================================
// PATCH { is_active: boolean } — a switched-off block stays in the library
//                                but is not offered when building days.
// DELETE                        — removes it.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { BLOCK_COLS, BLOCK_WRITE_DENIED, BLOCK_WRITE_ROLES } from '@/lib/day-blocks/access'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function writer() {
  const auth = await requireAuth()
  if (auth.error !== null) return { response: NextResponse.json({ success: false, error: auth.error }, { status: auth.status }) }
  const { supabase, tenant_id, role } = auth
  if (!supabase || !tenant_id) return { response: NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 }) }
  if (!BLOCK_WRITE_ROLES.includes(role || '')) return { response: NextResponse.json({ success: false, error: BLOCK_WRITE_DENIED }, { status: 403 }) }
  return { supabase, tenant_id }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const w = await writer()
    if ('response' in w) return w.response
    const { id } = await params
    const body = await request.json().catch(() => ({})) as { is_active?: unknown }
    if (typeof body.is_active !== 'boolean') return NextResponse.json({ success: false, error: 'is_active must be true or false' }, { status: 400 })
    const { data, error } = await w.supabase
      .from('day_blocks')
      .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', w.tenant_id)
      .select(BLOCK_COLS)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Block not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PATCH day-blocks error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update the block' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const w = await writer()
    if ('response' in w) return w.response
    const { id } = await params
    const { data, error } = await w.supabase.from('day_blocks').delete().eq('id', id).eq('tenant_id', w.tenant_id).select('id')
    if (error) throw error
    if (!data || data.length === 0) return NextResponse.json({ success: false, error: 'Block not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE day-blocks error:', error)
    return NextResponse.json({ success: false, error: 'Failed to remove the block' }, { status: 500 })
  }
}
