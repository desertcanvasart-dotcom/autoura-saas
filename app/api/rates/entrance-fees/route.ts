import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { validateRatePayload } from '@/lib/rate-validation'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

// ============================================
// ENTRANCE FEES API
// File: app/api/rates/entrance-fees/route.ts
//
// This endpoint powers the attractions dropdown
// in TourManagerContent.tsx
// ============================================

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const category = searchParams.get('category')
    const isAddon = searchParams.get('is_addon')
    const activeOnly = searchParams.get('active_only')
    // An optional cap on the row count (a picker asking for a few); a
    // missing or unreadable value means every row.
    const askedLimit = parseInt(searchParams.get('limit') || '', 10)
    const limit = Number.isFinite(askedLimit) && askedLimit > 0 ? askedLimit : null
    const search = searchParams.get('search')

    // Every page: PostgREST stops a plain select at 1000 rows without an
    // error, so rows past that could not be found to edit or deactivate.
    // `id` last keeps the paging stable between pages.
    const { data, error } = await fetchAllPages<Record<string, unknown>, { message: string }>((from, to) => {
      if (limit !== null && from >= limit) return Promise.resolve({ data: [], error: null })
      let query = (createAdminClient() as any)
        .from('entrance_fees')
        .select('*')
        // Tenant rows + shared/global catalog rows (tenant_id IS NULL)
        .eq('tenant_id', authResult.tenant_id)
        .order('city', { ascending: true })
        .order('attraction_name', { ascending: true })

      // Apply filters
      if (city) query = query.eq('city', city)
      if (category) query = query.eq('category', category)
      if (isAddon === 'true') query = query.eq('is_addon', true)
      if (isAddon === 'false') query = query.eq('is_addon', false)
      if (activeOnly === 'true') query = query.eq('is_active', true)
      if (search) query = query.ilike('attraction_name', `%${search}%`)
      return query.order('id').range(from, limit !== null ? Math.min(to, limit - 1) : to)
    })

    if (error) {
      console.error('GET entrance_fees error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      data: data || [],
      count: data?.length || 0
    })
  } catch (error: any) {
    console.error('GET entrance_fees catch error:', error)
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
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied

    const body = await request.json()

    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid rate values', violations: rateCheck.errors },
        { status: 400 }
      )
    }

    // NOT NULL columns: `|| null` used to coerce a blank one, and the insert
    // then died on a Postgres constraint message the user could not act on.
    if (!body.city) {
      return NextResponse.json(
        { success: false, error: 'Required: city' },
        { status: 400 }
      )
    }
    // A blank price is not a free site: `|| 0` stored one as 0, and a body
    // with only eur_rate made the site free for non-EU passports. The price is
    // required; the non-EU price is the same unless given (as the form does).
    const eurRate = parseFloat(body.eur_rate)
    if (!Number.isFinite(eurRate)) {
      return NextResponse.json({ success: false, error: 'Required: eur_rate (0 for a free site)' }, { status: 400 })
    }
    const nonEurRate = parseFloat(body.non_eur_rate)


    const newFee = {
      ...rateCurrencyWriteField(body),
      tenant_id: authResult.tenant_id,
      service_code: body.service_code || `ENT-${Date.now().toString(36).toUpperCase()}`,
      attraction_name: body.attraction_name,
      city: body.city,
      fee_type: body.fee_type || 'standard',
      eur_rate: eurRate,
      non_eur_rate: Number.isFinite(nonEurRate) ? nonEurRate : eurRate,
      student_discount_percentage: body.student_discount_percentage || 50,
      child_discount_percent: body.child_discount_percent || 50,
      season: body.season || 'all_year',
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      category: body.category || null,
      notes: body.notes || null,
      is_active: body.is_active !== false,
      is_addon: body.is_addon === true,
      addon_note: body.addon_note || null,
      supplier_id: body.supplier_id || null
    }

    // The caller's own RLS-bound client: the service key bypassed every
    // policy for a write that only ever lands in the caller's tenant.
    const { data, error } = await (authResult.supabase as any)
      .from('entrance_fees')
      .insert(newFee)
      .select('*')
      .single()

    if (error) {
      console.error('POST entrance_fees error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST entrance_fees catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}