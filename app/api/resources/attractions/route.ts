import { withoutKeys, IDENTITY_KEYS } from '@/lib/without-keys'
import { gateRole } from '@/lib/api-role-gate'
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
  // Viewers read; they do not change anything (lib/api-role-gate).
  const roleGate = await gateRole('staff')
  if (roleGate) return roleGate
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const body = withoutKeys(await request.json(), IDENTITY_KEYS) as Record<string, any>

    // A supplier id from the body must be this company's own: the embed below
    // would otherwise return another company's supplier name and city.
    if (body.supplier_id) {
      const { data: own } = await (createAdminClient() as any)
        .from('suppliers')
        .select('id')
        .eq('id', body.supplier_id)
        .eq('tenant_id', authResult.tenant_id)
        .maybeSingle()
      if (!own) {
        return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })
      }
    }

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