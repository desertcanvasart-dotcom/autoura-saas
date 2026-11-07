// ============================================
// /api/day-blocks/[id] — switch a block on or off, or remove it
// ============================================
// PATCH { is_active: boolean } — a switched-off block stays in the library
//                                but is not offered when building days.
// PATCH { land_package_id, land_package_day } — this block is day N of that
//                                land package (null clears it; migration 462).
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
    const body = await request.json().catch(() => ({})) as { is_active?: unknown; land_package_id?: unknown; land_package_day?: unknown }
    const patch: { is_active?: boolean; land_package_id?: string | null; land_package_day?: number | null; updated_at: string } = { updated_at: new Date().toISOString() }
    if ('is_active' in body) {
      if (typeof body.is_active !== 'boolean') return NextResponse.json({ success: false, error: 'is_active must be true or false' }, { status: 400 })
      patch.is_active = body.is_active
    }
    // Day N of a land package (migration 462). null clears the link.
    if ('land_package_id' in body) {
      if (body.land_package_id === null || body.land_package_id === '') {
        patch.land_package_id = null
        patch.land_package_day = null
      } else {
        if (typeof body.land_package_id !== 'string') return NextResponse.json({ success: false, error: 'land_package_id must be a package id or null' }, { status: 400 })
        // RLS read: only the company's own package can be linked.
        const { data: pkg } = await w.supabase.from('land_packages').select('id, duration_days').eq('id', body.land_package_id).maybeSingle()
        if (!pkg) return NextResponse.json({ success: false, error: 'That package is not in Rates → Land packages.' }, { status: 400 })
        const day = body.land_package_day === undefined ? 1 : Number(body.land_package_day)
        if (!Number.isInteger(day) || day < 1 || day > pkg.duration_days) {
          return NextResponse.json({ success: false, error: `The package has ${pkg.duration_days} day${pkg.duration_days === 1 ? '' : 's'} — pick day 1 to ${pkg.duration_days}.` }, { status: 400 })
        }
        patch.land_package_id = pkg.id
        patch.land_package_day = day
      }
    }
    if (!('is_active' in patch) && !('land_package_id' in patch)) {
      return NextResponse.json({ success: false, error: 'Nothing to change' }, { status: 400 })
    }
    const { data, error } = await w.supabase
      .from('day_blocks')
      .update(patch)
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
