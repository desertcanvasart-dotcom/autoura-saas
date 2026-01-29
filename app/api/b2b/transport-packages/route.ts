import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B TRANSPORT PACKAGES API
// File: app/api/b2b/transport-packages/route.ts
// ============================================

// Lazy-initialized Supabase admin client (avoids build-time errors)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('b2b_transport_packages')
      .select('*')
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
    const body = await request.json()

    const { data, error } = await supabaseAdmin
      .from('b2b_transport_packages')
      .insert({
        package_code: body.package_code || `PKG-${Date.now()}`,
        package_name: body.package_name,
        package_type: body.package_type || 'cruise_sightseeing',
        origin_city: body.origin_city,
        destination_city: body.destination_city,
        duration_days: body.duration_days || 1,
        sedan_rate: body.sedan_rate,
        sedan_capacity: body.sedan_capacity || 3,
        minivan_rate: body.minivan_rate,
        minivan_capacity: body.minivan_capacity || 7,
        van_rate: body.van_rate,
        van_capacity: body.van_capacity || 12,
        minibus_rate: body.minibus_rate,
        minibus_capacity: body.minibus_capacity || 20,
        bus_rate: body.bus_rate,
        bus_capacity: body.bus_capacity || 50,
        description: body.description,
        includes: body.includes,
        notes: body.notes,
        is_active: body.is_active ?? true
      })
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