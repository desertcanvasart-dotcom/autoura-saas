// ============================================
// /api/day-blocks — the agency's standard days (migration 398)
// ============================================
// GET  — every block, each paid attraction checked against the agency's own
//        entrance fees (through its aliases), and whether the caller may edit.
// POST — one new block (the grid's "Save as a block"); a code the agency
//        already uses is refused, never overwritten.
//
// RLS scopes the tables to the caller's tenant; the tenant is never taken
// from the request.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { buildAliasIndex } from '@/lib/pricing/attraction-aliases'
import type { FeeName } from '@/lib/pricing/alias-admin'
import { checkBlockAttractions } from '@/lib/day-blocks/attraction-check'
import { BLOCK_COLS, BLOCK_WRITE_DENIED, BLOCK_WRITE_ROLES } from '@/lib/day-blocks/access'
import { validateNewBlock } from '@/lib/day-blocks/from-grid-day'
import type { Json } from '@/types/database.types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const [blockRes, feeRes, aliasRes] = await Promise.all([
      supabase.from('day_blocks').select(BLOCK_COLS).eq('tenant_id', tenant_id).order('code'),
      supabase.from('entrance_fees').select('attraction_name, city').eq('tenant_id', tenant_id).eq('is_active', true),
      supabase.from('attraction_aliases').select('alias, canonical, tenant_id').eq('tenant_id', tenant_id).eq('is_active', true),
    ])
    if (blockRes.error) throw blockRes.error
    if (feeRes.error) throw feeRes.error
    if (aliasRes.error) throw aliasRes.error

    const fees = (feeRes.data ?? []) as FeeName[]
    const aliasIndex = buildAliasIndex(aliasRes.data ?? [])
    const blocks = (blockRes.data ?? []).map(b => ({
      ...b,
      attraction_checks: checkBlockAttractions(b.attractions ?? [], fees, aliasIndex),
    }))

    return NextResponse.json({ success: true, data: { blocks, canWrite: BLOCK_WRITE_ROLES.includes(role || '') } })
  } catch (error) {
    console.error('GET day-blocks error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load your day blocks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    if (!BLOCK_WRITE_ROLES.includes(role || '')) return NextResponse.json({ success: false, error: BLOCK_WRITE_DENIED }, { status: 403 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const check = validateNewBlock(body)
    if (!check.ok) return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    const { block } = check

    const { data: existing, error: readError } = await supabase
      .from('day_blocks').select('id').eq('tenant_id', tenant_id).eq('code', block.code).maybeSingle()
    if (readError) throw readError
    if (existing) {
      return NextResponse.json({ success: false, error: `A block with the code ${block.code} already exists — choose another code.` }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('day_blocks')
      // The tenant is the caller's own — never the request's.
      .insert({ ...block, meals: block.meals as unknown as Json, tenant_id })
      .select(BLOCK_COLS)
      .single()
    if (error) {
      // Two saves racing for one code: the unique (tenant_id, code) answers.
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: `A block with the code ${block.code} already exists — choose another code.` }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ success: true, data: { block: data } }, { status: 201 })
  } catch (error) {
    console.error('POST day-blocks error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the day block' }, { status: 500 })
  }
}
