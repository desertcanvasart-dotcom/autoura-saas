import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================
// B2B PRICING RULES API
// File: app/api/b2b/pricing-rules/route.ts
// ============================================

export async function GET() {
  try {
    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin
      .from('b2b_pricing_rules')
      .select('*')
      .order('service_name')

    if (error) {
      console.error('Error fetching pricing rules:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = createAdminClient()
    const body = await request.json()

    const { data, error } = await supabaseAdmin
      .from('b2b_pricing_rules')
      .insert({
        rate_table: body.rate_table || 'activity_rates',
        service_name: body.service_name,
        service_category: body.service_category || 'activity',
        pricing_model: body.pricing_model || 'per_person',
        unit_type: body.unit_type,
        tier1_min_pax: body.tier1_min_pax || 1,
        tier1_max_pax: body.tier1_max_pax,
        tier1_rate_eur: body.tier1_rate_eur,
        tier1_label: body.tier1_label,
        tier2_min_pax: body.tier2_min_pax,
        tier2_max_pax: body.tier2_max_pax,
        tier2_rate_eur: body.tier2_rate_eur,
        tier2_label: body.tier2_label,
        tier3_min_pax: body.tier3_min_pax,
        tier3_max_pax: body.tier3_max_pax,
        tier3_rate_eur: body.tier3_rate_eur,
        tier3_label: body.tier3_label,
        tier4_min_pax: body.tier4_min_pax,
        tier4_max_pax: body.tier4_max_pax,
        tier4_rate_eur: body.tier4_rate_eur,
        tier4_label: body.tier4_label,
        notes: body.notes,
        is_active: body.is_active ?? true
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating pricing rule:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}