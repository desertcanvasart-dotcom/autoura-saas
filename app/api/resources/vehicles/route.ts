import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { supplierTypeKeysForBehaviors } from '@/lib/vocabulary-server'
import { supplierTypesOrFilter } from '@/lib/suppliers/type-filter'

// GET /api/resources/vehicles
// Fetches transport suppliers mapped as vehicle resources (tenant-aware)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const isActive = searchParams.get('is_active')
    const city = searchParams.get('city')

    // Query suppliers filtered by transport types (RLS handles tenant filtering).
    // Any of a supplier's roles, not only the legacy main supplier_type: a
    // hotel group that also runs cars was missing (documents audit, round 12).
    // The agency's own types that behave as transport count too, as on
    // /api/suppliers.
    const transportKeys = await supplierTypeKeysForBehaviors(supabase, ['transport_company', 'transport', 'driver'])
    let query = supabase
      .from('suppliers')
      .select('*')
      .or(supplierTypesOrFilter(transportKeys) ?? 'supplier_type.in.(transport_company,transport,driver)')
      .order('company_name', { ascending: true })

    if (isActive === 'true') {
      query = query.eq('is_active', true)
    } else if (isActive === 'false') {
      query = query.eq('is_active', false)
    }

    if (city) {
      query = query.ilike('city', `%${city}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching transport suppliers:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch transport suppliers' }, { status: 500 })
    }

    const mappedData = (data || []).map((supplier: any) => ({
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
    }))

    return NextResponse.json({ success: true, data: mappedData })
  } catch (error) {
    console.error('Error in vehicles GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
