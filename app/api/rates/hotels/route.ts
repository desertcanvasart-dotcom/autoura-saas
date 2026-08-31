import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth } from '@/lib/supabase-server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { validateRatePayload } from '@/lib/rate-validation'
import type { TablesInsert } from '@/types/database.types'
import { sanitizeSeasons, legacyColumnMirror } from '@/lib/rates/rate-seasons'

export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects pricing data
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const city = searchParams.get('city')
    const tier = searchParams.get('tier')
    const activeOnly = searchParams.get('active_only') === 'true'

    // ✅ MULTI-TENANT: RLS policies automatically filter by tenant_id
    // See migration: 013_accommodation_rates_rls.sql
    // Only returns rates belonging to authenticated user's tenant
    let query = supabase
      .from('accommodation_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .order('property_name')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('city', city)
    if (tier) query = query.eq('tier', tier)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET accommodation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET accommodation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized rate creation
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Harness Layer 4: reject negative / absurd rate values at entry.
    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid rate values', violations: rateCheck.errors },
        { status: 400 }
      )
    }

    // ✅ MULTI-TENANT: tenant_id is auto-populated by database trigger
    // See migrations:
    //   - 007_create_tours_templates_tables.sql (creates auto_set_tenant_id trigger)
    //   - 013_accommodation_rates_rls.sql (applies trigger to this table)
    // The trigger automatically sets tenant_id from the authenticated user's session
    // RLS policies enforce that users can only insert rates for their own tenant
    const parsedSeasons = 'seasons' in body ? sanitizeSeasons(body.seasons, 'accommodation') : undefined
    const seasonsPatch: Record<string, unknown> = parsedSeasons === undefined
      ? {}
      : { seasons: parsedSeasons, ...legacyColumnMirror(parsedSeasons, 'accommodation') }
    // Supplier-HAS-properties (Phase 2): link the rate to its hotel, creating
    // the property under the supplier when needed; canonical spelling wins.
    const hotelProp = await resolveRateProperty(supabase, {
      tenantId: authResult.tenant_id!,
      propertyType: 'hotel',
      supplierId: body.supplier_id || null,
      name: body.property_name,
      propertyId: body.property_id,
    })


    const newHotel: TablesInsert<'accommodation_rates'> = {
      // Dated rate periods (C3.2). Only named when the client sent them, so a
      // database without migration 305 never sees the column; the first period
      // is mirrored onto the base columns for date-less readers.
      ...seasonsPatch,
      ...rateCurrencyWriteField(body),
      // Basic info
      tenant_id,
      service_code: body.service_code || `ACC-${Date.now().toString(36).toUpperCase()}`,
      property_name: hotelProp.name || body.property_name,
      ...(hotelProp.property_id ? { property_id: hotelProp.property_id } : {}),
      property_type: body.property_type || 'hotel',
      city: body.city || null,
      board_basis: body.board_basis || 'BB',
      tier: body.tier || 'standard',
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,

      // Hotel contacts
      contact_name: body.contact_name || null,
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
      reservations_email: body.reservations_email || null,
      reservations_phone: body.reservations_phone || null,

      // Low Season dates
      low_season_from: body.low_season_from || null,
      low_season_to: body.low_season_to || null,

      // Low Season rates - EUR
      single_rate_eur: parseFloat(body.single_rate_eur) || 0,
      double_rate_eur: parseFloat(body.double_rate_eur) || 0,
      triple_rate_eur: parseFloat(body.triple_rate_eur) || 0,
      suite_rate_eur: parseFloat(body.suite_rate_eur) || 0,

      // Low Season rates - Non-EUR
      single_rate_non_eur: parseFloat(body.single_rate_non_eur) || 0,
      double_rate_non_eur: parseFloat(body.double_rate_non_eur) || 0,
      triple_rate_non_eur: parseFloat(body.triple_rate_non_eur) || 0,
      suite_rate_non_eur: parseFloat(body.suite_rate_non_eur) || 0,

      // High Season dates
      high_season_from: body.high_season_from || null,
      high_season_to: body.high_season_to || null,

      // High Season rates - EUR
      high_season_single_eur: parseFloat(body.high_season_single_eur) || 0,
      high_season_double_eur: parseFloat(body.high_season_double_eur) || 0,
      high_season_triple_eur: parseFloat(body.high_season_triple_eur) || 0,
      high_season_suite_eur: parseFloat(body.high_season_suite_eur) || 0,

      // High Season rates - Non-EUR
      high_season_single_non_eur: parseFloat(body.high_season_single_non_eur) || 0,
      high_season_double_non_eur: parseFloat(body.high_season_double_non_eur) || 0,
      high_season_triple_non_eur: parseFloat(body.high_season_triple_non_eur) || 0,
      high_season_suite_non_eur: parseFloat(body.high_season_suite_non_eur) || 0,

      // Peak Season dates (Period 1)
      peak_season_from: body.peak_season_from || null,
      peak_season_to: body.peak_season_to || null,

      // Peak Season dates (Period 2 - optional)
      peak_season_2_from: body.peak_season_2_from || null,
      peak_season_2_to: body.peak_season_2_to || null,

      // Peak Season rates - EUR
      peak_season_single_eur: parseFloat(body.peak_season_single_eur) || 0,
      peak_season_double_eur: parseFloat(body.peak_season_double_eur) || 0,
      peak_season_triple_eur: parseFloat(body.peak_season_triple_eur) || 0,
      peak_season_suite_eur: parseFloat(body.peak_season_suite_eur) || 0,

      // Peak Season rates - Non-EUR
      peak_season_single_non_eur: parseFloat(body.peak_season_single_non_eur) || 0,
      peak_season_double_non_eur: parseFloat(body.peak_season_double_non_eur) || 0,
      peak_season_triple_non_eur: parseFloat(body.peak_season_triple_non_eur) || 0,
      peak_season_suite_non_eur: parseFloat(body.peak_season_suite_non_eur) || 0,

      // Rate validity
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,

      // Other
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    const { data, error } = await supabase
      .from('accommodation_rates')
      .insert(newHotel)
      .select('*')
      .single()

    if (error) {
      console.error('POST accommodation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST accommodation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}