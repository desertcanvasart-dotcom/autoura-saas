import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// ============================================
// B2B TRANSPORT PACKAGES API - Single Item
// File: app/api/b2b/transport-packages/[id]/route.ts
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params
    const body = await request.json()

    const { data, error } = await (createAdminClient() as any)
      .from('b2b_transport_packages')
      .update({
        package_code: body.package_code,
        package_name: body.package_name,
        package_type: body.package_type,
        origin_city: body.origin_city,
        destination_city: body.destination_city,
        duration_days: body.duration_days,
        sedan_rate: body.sedan_rate,
        sedan_capacity: body.sedan_capacity,
        minivan_rate: body.minivan_rate,
        minivan_capacity: body.minivan_capacity,
        van_rate: body.van_rate,
        van_capacity: body.van_capacity,
        minibus_rate: body.minibus_rate,
        minibus_capacity: body.minibus_capacity,
        bus_rate: body.bus_rate,
        bus_capacity: body.bus_capacity,
        description: body.description,
        includes: body.includes,
        notes: body.notes,
        is_active: body.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating transport package:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { error } = await createAdminClient()
      .from('b2b_transport_packages')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

    if (error) {
      console.error('Error deleting transport package:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}