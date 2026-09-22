import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { sanitizePackageVehicles } from '@/lib/pricing/package-vehicle'

// ============================================
// B2B TRANSPORT PACKAGES API
// File: app/api/b2b/transport-packages/route.ts
// ============================================

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { data, error } = await (createAdminClient() as any)
      .from('b2b_transport_packages')
      .select('*')
      .eq('tenant_id', authResult.tenant_id)
      .order('package_name')

    if (error) {
      console.error('Error fetching transport packages:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
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

    const { data, error } = await (createAdminClient() as any)
      .from('b2b_transport_packages')
      .insert({
        tenant_id: authResult.tenant_id,
        package_code: body.package_code || `PKG-${Date.now()}`,
        package_name: body.package_name,
        package_type: body.package_type || 'cruise_sightseeing',
        origin_city: body.origin_city,
        destination_city: body.destination_city,
        duration_days: body.duration_days || 1,
        // Vehicles keyed by the agency's vehicle_type vocabulary (mig 381).
        vehicles: sanitizePackageVehicles(body.vehicles),
        description: body.description,
        includes: body.includes,
        notes: body.notes,
        is_active: body.is_active ?? true
      } as any)
      .select()
      .single()

    if (error) {
      console.error('Error creating transport package:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}