import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET /api/resources/vehicles/[id]
// Single transport supplier, mapped to the same vehicle-resource shape the
// list route returns. ResourceSummaryCard calls this to resolve an assigned
// vehicle; before this route existed it fetched /api/vehicles/[id], which
// has never been a route in this app.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const { id } = await params

    // RLS scopes the read to the caller's tenant.
    const { data: supplier, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('Error fetching transport supplier:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch vehicle' }, { status: 500 })
    }
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: supplier.id,
        name: supplier.company_name || supplier.name,
        type: supplier.supplier_type,
        city: supplier.city || null,
        phone: supplier.contact_phone || null,
        whatsapp: supplier.whatsapp || null,
        email: supplier.contact_email || null,
        vehicle_types: supplier.vehicle_types || [],
        notes: supplier.notes || null,
        is_active: supplier.is_active,
        created_at: supplier.created_at,
      },
    })
  } catch (error) {
    console.error('Error in vehicle GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
