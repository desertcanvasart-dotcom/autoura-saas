// One tour variation, scoped by tenant: read (the options screen reads its
// name from here), edit and delete. The services live at ./services.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { parseVariationEdit } from '@/lib/tours/variation-edit'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id } = await params

    const { data, error } = await supabase
      .from('tour_variations')
      .select('id, template_id, variation_code, variation_name, tier, group_type, min_pax, max_pax, is_active')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('GET variation:', error)
    return NextResponse.json({ success: false, error: 'Failed to load the variation' }, { status: 500 })
  }
}

// PATCH — edit a variation: its name, private / shared, passenger range and
// Active. The tier is what the variation IS (one per tier per tour), so it is
// not changed here: add a variation at the other tier instead.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    const { id } = await params
    const body = await request.json()

    const parsed = parseVariationEdit(body)
    if ('error' in parsed) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })

    const { data, error } = await supabase
      .from('tour_variations')
      .update({ ...parsed.update, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select('id, template_id, variation_code, variation_name, tier, group_type, min_pax, max_pax, is_active')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PATCH variation:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the variation' }, { status: 500 })
  }
}

// DELETE — a variation and what hangs off it (its services, options and
// pricing go with it). B2B quotes and departures made from it keep their own
// figures but lose the link, so when any exist the caller is told how many and
// must confirm with ?confirm_in_use=1.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    const { id } = await params

    const { data: variation } = await supabase
      .from('tour_variations').select('id, variation_name')
      .eq('id', id).eq('tenant_id', tenant_id).maybeSingle()
    if (!variation) return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })

    const confirmed = new URL(request.url).searchParams.get('confirm_in_use') === '1'
    if (!confirmed) {
      const [quotes, departures] = await Promise.all([
        supabase.from('b2b_quotes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('variation_id', id),
        supabase.from('tour_departures').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('variation_id', id),
      ])
      const inUse = { quotes: quotes.count ?? 0, departures: departures.count ?? 0 }
      if (inUse.quotes > 0 || inUse.departures > 0) {
        return NextResponse.json({ success: false, in_use: inUse, error: 'This variation is used by quotes or departures' }, { status: 409 })
      }
    }

    const { error } = await supabase.from('tour_variations').delete().eq('id', id).eq('tenant_id', tenant_id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE variation:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete the variation' }, { status: 500 })
  }
}
