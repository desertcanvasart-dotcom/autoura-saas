import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

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
    const city = searchParams.get('city')
    const activityCategory = searchParams.get('activity_category')
    const activityType = searchParams.get('activity_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = (createAdminClient() as any)
      .from('activity_rates')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email)
      `)
      .eq('tenant_id', authResult.tenant_id)
      .order('activity_name')
      .order('activity_category')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('city', city)
    if (activityCategory) query = query.eq('activity_category', activityCategory)
    if (activityType) query = query.eq('activity_type', activityType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching activity rates:', error)
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

    const newRate = {
      ...body,
      supplier_id: body.supplier_id || null,
      tenant_id: authResult.tenant_id
    }

    const { data, error } = await (createAdminClient() as any)
      .from('activity_rates')
      .insert([newRate])
      .select(`*, supplier:supplier_id (id, name, city)`)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating activity rate:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}