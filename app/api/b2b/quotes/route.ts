import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { partnerInTenant } from '@/lib/quotes/partner-in-tenant'
import { calculatorPricingTable, pickEditable, rateSheetFromPaxTable } from '@/lib/quotes/calculator-pricing-table'
import { priceVariation } from '@/lib/b2b/price-variation'
import { isBookableLine } from '@/lib/pricing/breakdown-order'

// ============================================
// B2B QUOTES API — calculator save/list/update
// Writes b2b_quotes: the single B2B quote store since migration 270
// (tour_quotes retired; see docs/B2B-QUOTE-STORES-OPTIONS.md).
// ============================================

// Service-role client (auth is enforced per-handler via requireAuth)
function getSupabaseAdmin() {
  return createAdminClient()
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const partner_id = searchParams.get('partner_id')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get single quote by ID
    if (id) {
      const { data, error } = await (getSupabaseAdmin() as any)
        .from('b2b_quotes')
        .select(`
          *,
          tour_variations (variation_name, variation_code, tier, tour_templates (template_name, template_code, duration_days)),
          b2b_partners (company_name, partner_code, contact_name, email)
        `)
        .eq('id', id)
        .eq('tenant_id', authResult.tenant_id)
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    // List quotes
    let query = (getSupabaseAdmin() as any)
      .from('b2b_quotes')
      .select(`
        *,
        tour_variations (variation_name, variation_code, tier, tour_templates (template_name, template_code)),
        b2b_partners (company_name, partner_code)
      `)
      .eq('tenant_id', authResult.tenant_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (partner_id) query = query.eq('partner_id', partner_id)
    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json({ success: true, data: data || [] })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const body = await request.json()
    const {
      variation_id,
      partner_id,
      client_name,
      client_email,
      client_phone,
      client_nationality,
      valid_days = 30,
      notes,
      created_by
    } = body

    if (!variation_id) {
      return NextResponse.json({ success: false, error: 'variation_id is required' }, { status: 400 })
    }

    // The price is the server's own: the calculator's inputs (`pricing`, the
    // body it sent to /api/b2b/calculate-price) are priced again here, and
    // nothing the browser computed — totals, margin, per-person price, the
    // services or the rate sheet — is stored. Rates changed since the
    // calculation are the ones saved.
    const pricing = body.pricing
    if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
      return NextResponse.json({ success: false, error: 'Calculate the price before saving the quote' }, { status: 400 })
    }
    const priced = await priceVariation(authResult.tenant_id, { ...pricing, variation_id })
    const result = priced.body.data
    if (priced.status !== 200 || !result) {
      return NextResponse.json(
        { success: false, error: priced.body.error || 'The price could not be calculated' },
        { status: priced.status === 200 ? 500 : priced.status }
      )
    }
    if (!(result.total_cost > 0) || !(result.selling_price > 0)) {
      return NextResponse.json({ success: false, error: 'Pricing data is required' }, { status: 400 })
    }
    // The CHOSEN optional services travel with the quote as real services. A
    // no-rate line is a service to book; a line already inside another (a
    // meal in the hotel rate) is not.
    const servicesSnapshot = [
      ...result.services.filter(isBookableLine),
      ...(result.optional_services || []).filter(s => s.is_selected),
    ]
    const guideGrade = typeof pricing.guide_grade === 'string' ? pricing.guide_grade : null
    const guideMode = typeof pricing.guide_mode === 'string' ? pricing.guide_mode : null

    // The partner must be this tenant's: the quote is later read and sent to
    // it through the admin client (lib/quotes/partner-in-tenant).
    const partnerCheck = await partnerInTenant(getSupabaseAdmin(), partner_id, authResult.tenant_id)
    if (!partnerCheck.ok) {
      return NextResponse.json({ success: false, error: partnerCheck.error }, { status: partnerCheck.status })
    }

    // NOT NULL, read by every partner page: the quote's own size plus the
    // rate sheet generated on the calculator, when there is one.
    const pricingTable = calculatorPricingTable(
      { pax: result.num_pax, sellingPrice: result.selling_price, pricePerPerson: result.price_per_person },
      body.include_rate_sheet ? rateSheetFromPaxTable(result.pax_pricing_table, result.tour_leader_included) : undefined
    )
    if (!pricingTable) {
      return NextResponse.json({ success: false, error: 'A group size, selling price and per-person price are required' }, { status: 400 })
    }

    // The tour this rate sheet is for: a calculator quote has no itinerary,
    // so without its own trip_name the email, WhatsApp and PDF said "Your
    // tour" and "0 days". From this tenant's own template.
    const { data: variation } = await getSupabaseAdmin()
      .from('tour_variations')
      .select('variation_name, tour_templates!inner(template_name, tenant_id)')
      .eq('id', variation_id)
      .eq('tour_templates.tenant_id', authResult.tenant_id)
      .maybeSingle()
    const templateName = (variation?.tour_templates as { template_name?: string } | null | undefined)?.template_name
    const tripName = [templateName, variation?.variation_name].filter(Boolean).join(' — ') || null

    // Calculate valid_until date
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + valid_days)

    // b2b_quotes numbering comes from the shared RPC (tour_quotes had a
    // trigger; this table does not)
    const { data: quoteNum } = await (getSupabaseAdmin() as any).rpc('generate_b2b_quote_number')
    const { data: quote, error } = await (getSupabaseAdmin() as any)
      .from('b2b_quotes')
      .insert({
        tenant_id: authResult.tenant_id,
        variation_id,
        partner_id: partner_id || null,
        trip_name: tripName,
        client_name,
        client_email,
        client_phone,
        client_nationality,
        travel_date: result.travel_date,
        num_adults: result.num_pax,
        num_children: 0,
        services_snapshot: servicesSnapshot,
        total_cost: result.total_cost,
        margin_percent: result.margin_percent,
        margin_amount: result.margin_amount,
        selling_price: result.selling_price,
        price_per_person: result.price_per_person,
        // The run's currency (the tenant's rates currency), not EUR.
        currency: result.currency,
        tour_leader_included: result.tour_leader_included,
        tour_leader_cost: result.tour_leader_cost || null,
        // NOT NULL: a quote with no supplement stores 0, never null.
        single_supplement: Number(result.single_supplement) || 0,
        pricing_table: pricingTable,
        // Store only non-default values (mig 326): NULL = egyptologist/spot.
        guide_grade: !guideGrade || guideGrade === 'egyptologist' ? null : guideGrade,
        guide_mode: !guideMode || guideMode === 'spot' ? null : guideMode,
        is_eur_passport: result.is_eur_passport,
        season: result.season,
        status: 'draft',
        valid_until: validUntil.toISOString().split('T')[0],
        notes,
        source: 'calculator',
        quote_number: quoteNum || `B2B-${Date.now()}`,
        // Attribution (mig 269/270): the staff member saving the quote.
        created_by: created_by || authResult.user!.id
      } as any)
      .select()
      .single()

    if (error) {
      console.error('Error creating quote:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const q = quote as any

    return NextResponse.json({ success: true, data: q }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/b2b/quotes:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const body = await request.json()
    const id = body?.id

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    // Only the editable fields — the body was spread into the update, so a
    // request could set any column, prices and partner included.
    const updates = pickEditable(body)
    if (updates.partner_id !== undefined) {
      const partnerCheck = await partnerInTenant(getSupabaseAdmin(), updates.partner_id, authResult.tenant_id)
      if (!partnerCheck.ok) {
        return NextResponse.json({ success: false, error: partnerCheck.error }, { status: partnerCheck.status })
      }
      updates.partner_id = updates.partner_id || null
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await (getSupabaseAdmin() as any)
      .from('b2b_quotes')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from('b2b_quotes')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

    if (error) throw error
    return NextResponse.json({ success: true })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}