import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
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
      .from('train_rates')
      .select('*')
      .eq('id', id)
      // Tenant rows, merged with the global catalog when the tenant's
      // use_global_catalog flag is on (see lib/catalog-scope.ts).
      .or(catalogOrExpr(await getCatalogScope(createAdminClient(), authResult.tenant_id)))
      .single()

    if (error) {
      console.error('GET train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET train_rate catch error:', error)
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
    if (body.class_type !== undefined) updateData.class_type = body.class_type || null
    if (body.rate_eur !== undefined) updateData.rate_eur = parseFloat(body.rate_eur) || 0
    if (body.duration_hours !== undefined) updateData.duration_hours = body.duration_hours ? parseFloat(body.duration_hours) : null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if (body.operator_name !== undefined) updateData.operator_name = body.operator_name || null
    if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null
    if (body.departure_times !== undefined) updateData.departure_times = body.departure_times || null
    if (body.description !== undefined) updateData.description = body.description || null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await (createAdminClient() as any)
      .from('train_rates')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT train_rate catch error:', error)
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
      .from('train_rates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

    if (error) {
      console.error('DELETE train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE train_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}