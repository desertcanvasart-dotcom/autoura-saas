// GET one tour variation, scoped by tenant. The options screen reads the
// variation's name from here; the services live at ./services.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

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
