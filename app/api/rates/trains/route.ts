import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { attachPropertyNames } from '@/lib/suppliers/attach-property-names'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'
import { getCatalogScope, catalogOrExpr } from '@/lib/catalog-scope'

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

    // The rate names WHICH train it prices; the list could not show it.
    return NextResponse.json({ success: true, data: await attachPropertyNames(createAdminClient(), data) })
  } catch (error: any) {
    console.error('GET train_rates catch error:', error)
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

    // Optional explicit link to one of the supplier's trains (Phase 3);
    // a stale id resolves to null, and null is omitted so an unmigrated
    // database still saves.
    const trainProp = await resolveRateProperty(createAdminClient(), {
      tenantId: authResult.tenant_id!,
      propertyType: 'train',
      supplierId: body.supplier_id || null,
      name: null,
      propertyId: body.property_id,
    })

    // NOT NULL columns: `|| null` used to coerce a blank one, and the insert
    // then died on a Postgres constraint message the user could not act on.
    if (!body.origin_city || !body.destination_city) {
      return NextResponse.json(
        { success: false, error: 'Required: origin_city, destination_city' },
        { status: 400 }
      )
    }


    const newRate = {
      // Throughout guide's negotiated fare (B1/B2): sent only when the form
      // filled it. NULL = guide pays the customer fare; 0 = rides free.
      ...(body.guide_rate !== undefined
        ? { guide_rate: body.guide_rate === '' || body.guide_rate === null ? null : Number(body.guide_rate) }
        : {}),
      ...rateCurrencyWriteField(body),
      tenant_id: authResult.tenant_id,
      service_code: body.service_code || `TRN-${Date.now().toString(36).toUpperCase()}`,
      origin_city: body.origin_city,
      destination_city: body.destination_city,
      class_type: body.class_type || null,
      rate_eur: parseFloat(body.rate_eur) || 0,
      duration_hours: body.duration_hours ? parseFloat(body.duration_hours) : null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      // The supplier IS the operator (lib/suppliers/operator-name.ts).
      operator_name: await operatorNameForSupplier(createAdminClient(), {
        tenantId: authResult.tenant_id!,
        supplierId: body.supplier_id,
        fallback: body.operator_name,
      }),
      supplier_id: body.supplier_id || null,
      ...(trainProp.property_id ? { property_id: trainProp.property_id } : {}),
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