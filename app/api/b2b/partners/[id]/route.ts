import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

// ============================================
// B2B PARTNERS INDIVIDUAL API
// File: app/api/b2b/partners/[id]/route.ts
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('b2b_partners')
      .select(`
        *,
        b2b_partner_pricing (
          id, variation_id, margin_percent_override, fixed_price_per_pax, is_active,
          tour_variations (variation_name, variation_code, tier, tour_templates (template_name))
        ),
        tour_quotes (id, quote_number, status, selling_price, created_at)
      `)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    const body = await request.json()
    const { id: _, created_at, tenant_id, ...updateData } = body

    const { data, error } = await supabase
      .from('b2b_partners')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    const { data: quotes } = await supabase
      .from('tour_quotes')
      .select('id')
      .eq('partner_id', id)
      .limit(1)

    if (quotes && quotes.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete partner with existing quotes. Deactivate instead.' },
        { status: 400 }
      )
    }

    await supabase.from('b2b_partner_pricing').delete().eq('partner_id', id)

    const { error } = await supabase.from('b2b_partners').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Partner deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}