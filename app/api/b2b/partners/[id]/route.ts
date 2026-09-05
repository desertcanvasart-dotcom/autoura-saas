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

    // b2b_partner_pricing has NO foreign key to b2b_partners (or to
    // tour_variations) — only tenant_id. Embedding it made PostgREST reject
    // the WHOLE query with PGRST200, so the partner page 500'd. The pricing
    // rows and their variations are joined app-side instead. (The b2b_quotes
    // embed rides a real FK and stays.)
    const { data, error } = await supabase
      .from('b2b_partners')
      .select(`
        *,
        b2b_quotes (id, quote_number, status, selling_price, created_at)
      `)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
    }

    const { data: pricingRows } = await supabase
      .from('b2b_partner_pricing')
      .select('id, variation_id, margin_percent_override, fixed_price_per_pax, is_active')
      .eq('partner_id', id)

    const variationIds = [...new Set((pricingRows ?? []).map(p => p.variation_id).filter(Boolean))] as string[]
    const { data: variations } = variationIds.length
      ? await supabase
          .from('tour_variations')
          .select('id, variation_name, variation_code, tier, tour_templates (template_name)')
          .in('id', variationIds)
      : { data: [] }
    const variationById = new Map((variations ?? []).map(v => [v.id, v]))

    const withPricing = {
      ...data,
      b2b_partner_pricing: (pricingRows ?? []).map(p => ({
        ...p,
        // The shape the embed was supposed to produce.
        tour_variations: (p.variation_id && variationById.get(p.variation_id)) || null,
      })),
    }

    return NextResponse.json({ success: true, data: withPricing })
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
      .from('b2b_quotes')
      .select('id')
      .eq('partner_id', id)
      .limit(1)

    if (quotes && quotes.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete partner with existing quotes. Deactivate instead.' },
        { status: 400 }
      )
    }

    // Checked, and it aborts: the partner itself is deleted next, so a silent
    // failure here leaves pricing rows hanging off a partner that no longer
    // exists — unreachable, and impossible to retry because the parent is gone.
    const { error: pricingErr } = await supabase
      .from('b2b_partner_pricing').delete().eq('partner_id', id)
    if (pricingErr) {
      console.error('[b2b/partners DELETE] partner pricing:', pricingErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to delete partner pricing. Nothing was removed.' },
        { status: 500 }
      )
    }

    const { error } = await supabase.from('b2b_partners').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Partner deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}