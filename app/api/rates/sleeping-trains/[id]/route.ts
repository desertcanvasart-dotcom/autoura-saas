import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'
import { getCatalogScope, catalogOrExpr } from '@/lib/catalog-scope'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { data, error } = await (createAdminClient() as any)
      .from('sleeping_train_rates')
      .select('*')
      .eq('id', id)
      // Tenant rows, merged with the global catalog when the tenant's
      // use_global_catalog flag is on (see lib/catalog-scope.ts).
      .or(catalogOrExpr(await getCatalogScope(createAdminClient(), authResult.tenant_id)))
      .single()

    if (error) {
      console.error('GET sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET sleeping_train_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params
    const body = await request.json()

    const updateData: Record<string, any> = {}
Object.assign(updateData, rateCurrencyWriteField(body))

    if (body.service_code !== undefined) updateData.service_code = body.service_code
    if (body.origin_city !== undefined) updateData.origin_city = body.origin_city || null
    if (body.destination_city !== undefined) updateData.destination_city = body.destination_city || null
    if (body.cabin_type !== undefined) updateData.cabin_type = body.cabin_type || null
    if (body.rate_oneway_eur !== undefined) updateData.rate_oneway_eur = parseFloat(body.rate_oneway_eur) || 0
    if (body.rate_roundtrip_eur !== undefined) updateData.rate_roundtrip_eur = body.rate_roundtrip_eur ? parseFloat(body.rate_roundtrip_eur) : null
    if (body.departure_time !== undefined) updateData.departure_time = body.departure_time || null
    if (body.arrival_time !== undefined) updateData.arrival_time = body.arrival_time || null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if (body.season !== undefined) updateData.season = body.season || null
    // The supplier IS the operator: derive the denormalized name rather
    // than trusting the client, so the two can never disagree. Clearing the
    // supplier clears the name — a name with no supplier is the orphan state
    // this replaced. A payload naming neither (e.g. CSV) is left alone.
    if (body.supplier_id !== undefined || body.operator_name !== undefined) {
      updateData.operator_name = await operatorNameForSupplier(createAdminClient(), {
        tenantId: authResult.tenant_id!,
        supplierId: body.supplier_id,
        fallback: body.operator_name,
      })
    }
    if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null
    if (body.property_id !== undefined) {
      const trainProp = await resolveRateProperty(createAdminClient(), {
        tenantId: authResult.tenant_id!,
        propertyType: 'train',
        supplierId: body.supplier_id || null,
        name: null,
        propertyId: body.property_id,
      })
      updateData.property_id = trainProp.property_id
    }
    if (body.description !== undefined) updateData.description = body.description || null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await (createAdminClient() as any)
      .from('sleeping_train_rates')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT sleeping_train_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { error } = await createAdminClient()
      .from('sleeping_train_rates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

    if (error) {
      console.error('DELETE sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE sleeping_train_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}