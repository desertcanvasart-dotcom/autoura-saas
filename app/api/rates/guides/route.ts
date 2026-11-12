import { NextRequest, NextResponse } from 'next/server'
import { guideRateLists } from '@/lib/guides/guide-rate-lists'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { validateRatePayload } from '@/lib/rate-validation'
import type { TablesInsert } from '@/types/database.types'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

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
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const language = searchParams.get('language')
    const city = searchParams.get('city')
    const guideType = searchParams.get('guide_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    // Every page: PostgREST stops a plain select at 1000 rows without an
    // error, so rows past that could not be found to edit or deactivate.
    // `id` last keeps the paging stable between pages.
    const { data, error } = await fetchAllPages((from, to) => {
      let query = supabase
        .from('guide_rates')
        .select('*')
        .order('guide_language')

      if (supplierId) query = query.eq('supplier_id', supplierId)
      if (guideType) query = query.eq('guide_type', guideType)
      if (activeOnly) query = query.eq('is_active', true)
      return query.order('id').range(from, to)
    })

    if (error) {
      console.error('GET guide_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // A price covers its city/language AND its other ones (migration 463).
    const has = (first: unknown, more: unknown, want: string) =>
      [first, ...(Array.isArray(more) ? more : [])].some(v => String(v ?? '').trim().toLowerCase() === want.trim().toLowerCase())
    const rows = (data || []).filter(r =>
      (!city || has(r.city, r.other_cities, city)) &&
      (!language || has(r.guide_language, r.other_languages, language)))

    return NextResponse.json({ success: true, data: rows })
  } catch (error: any) {
    console.error('GET guide_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects pricing data
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult

    const body = await request.json()

    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid rate values', violations: rateCheck.errors },
        { status: 400 }
      )
    }

    // ONE price for every city and language it covers (migration 463):
    // first city/language in city/guide_language, the rest in the lists.
    const lists = guideRateLists(body)
    if (!lists.guide_language) {
      return NextResponse.json({ success: false, error: 'Choose a language' }, { status: 400 })
    }

    const row: TablesInsert<'guide_rates'> = {
      ...rateCurrencyWriteField(body),
      tenant_id,
      service_code: body.service_code || `GD-${Date.now().toString(36).toUpperCase()}`,
      guide_language: lists.guide_language,
      other_languages: lists.other_languages,
      guide_type: body.guide_type || 'licensed',
      // The mode the rate is for; every rate so far was a Spot rate (380).
      guide_mode: body.guide_mode || 'spot',
      city: lists.city,
      other_cities: lists.other_cities,
      tour_duration: body.tour_duration || 'full_day',
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || 0,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: body.supplier_id || null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    const { data, error } = await supabase
      .from('guide_rates')
      .insert(row)
      .select('*')
      .single()

    if (error) {
      console.error('POST guide_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST guide_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}