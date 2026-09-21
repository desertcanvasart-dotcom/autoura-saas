// ============================================
// /api/attraction-aliases/[id] — change or remove one alias
// ============================================
// PATCH  — { alias?, canonical?, is_active? }
// DELETE — remove it. An alias is only a pointer: deleting one touches no
//          fee and no tour, and the wording simply goes back to being looked
//          up as written.
//
// Owner/admin only. RLS already hides every other agency's rows; the explicit
// tenant filter is there so that stays true even under a service-role client.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { validateAlias, type FeeName, type StoredAlias } from '@/lib/pricing/alias-admin'
import { ALIAS_COLS, ALIAS_WRITE_ROLES, ALIAS_WRITE_DENIED } from '@/lib/pricing/alias-admin-access'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    if (!ALIAS_WRITE_ROLES.includes(role || '')) return NextResponse.json({ success: false, error: ALIAS_WRITE_DENIED }, { status: 403 })

    const { id } = await params
    const { data: all } = await supabase.from('attraction_aliases').select('id, alias, canonical, is_active').eq('tenant_id', tenant_id)
    const current = (all ?? []).find(a => a.id === id)
    if (!current) return NextResponse.json({ success: false, error: 'Alias not found' }, { status: 404 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const patch: { alias?: string; canonical?: string; is_active?: boolean; updated_at: string } = { updated_at: new Date().toISOString() }
    let note: string | undefined

    if ('alias' in body || 'canonical' in body) {
      const { data: fees } = await supabase.from('entrance_fees').select('attraction_name, city').eq('tenant_id', tenant_id).eq('is_active', true)
      const verdict = validateAlias(
        { alias: 'alias' in body ? body.alias : current.alias, canonical: 'canonical' in body ? body.canonical : current.canonical },
        (fees ?? []) as FeeName[], (all ?? []) as StoredAlias[], id
      )
      if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })
      patch.alias = verdict.alias
      patch.canonical = verdict.canonical
      note = verdict.note
    }
    // Switching one OFF is always allowed — it is how a broken alias is parked.
    if ('is_active' in body) patch.is_active = Boolean(body.is_active)

    const { data, error } = await supabase
      .from('attraction_aliases').update(patch).eq('id', id).eq('tenant_id', tenant_id).select(ALIAS_COLS).single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, error: 'Another alias already uses that wording.' }, { status: 409 })
      throw error
    }
    return NextResponse.json({ success: true, data, ...(note ? { note } : {}) })
  } catch (error) {
    console.error('PATCH attraction-aliases error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update the alias' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    if (!ALIAS_WRITE_ROLES.includes(role || '')) return NextResponse.json({ success: false, error: ALIAS_WRITE_DENIED }, { status: 403 })

    const { id } = await params
    const { data, error } = await supabase
      .from('attraction_aliases').delete().eq('id', id).eq('tenant_id', tenant_id).select('id')
    if (error) throw error
    // "Deleted" only if a row actually went — a silent no-op reads as success
    // and is how "delete did nothing" reports start.
    if (!data || data.length === 0) return NextResponse.json({ success: false, error: 'Alias not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE attraction-aliases error:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete the alias' }, { status: 500 })
  }
}
