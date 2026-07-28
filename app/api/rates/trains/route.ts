import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { getCatalogScope, catalogOrExpr } from '@/lib/catalog-scope'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const originCity = searchParams.get('origin_city')
    const destinationCity = searchParams.get('destination_city')
    const classType = searchParams.get('class_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = (createAdminClient() as any)
      .from('train_rates')
      .select('*')
      // Tenant rows, merged with the global catalog when the tenant's
      // use_global_catalog flag is on (see lib/catalog-scope.ts).
      .or(catalogOrExpr(await getCatalogScope(createAdminClient(), authResult.tenant_id)))
      .order('origin_city')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (originCity) query = query.eq('origin_city', originCity)
    if (destinationCity) query = query.eq('destination_city', destinationCity)
    if (classType) query = query.eq('class_type', classType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET train_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET train_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const body = await request.json()

    const newRate = {
      tenant_id: authResult.tenant_id,
      service_code: body.service_code || `TRN-${Date.now().toString(36).toUpperCase()}`,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      class_type: body.class_type || null,
      rate_eur: parseFloat(body.rate_eur) || 0,
      duration_hours: body.duration_hours ? parseFloat(body.duration_hours) : null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      operator_name: body.operator_name || null,
      supplier_id: body.supplier_id || null,
      departure_times: body.departure_times || null,
      description: body.description || null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    const { data, error } = await (createAdminClient() as any)
      .from('train_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST train_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST train_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}