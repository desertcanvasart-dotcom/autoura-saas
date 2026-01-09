import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// All valid supplier fields (including hierarchical fields)
const VALID_FIELDS = [
  'name', 'type', 'contact_name', 'contact_email', 'contact_phone',
  'phone2', 'whatsapp', 'website', 'address', 'city', 'country',
  'default_commission_rate', 'commission_type', 'payment_terms',
  'bank_details', 'status', 'notes',
  // Type-specific fields
  'languages', 'vehicle_types', 'star_rating', 'property_type',
  'cuisine_types', 'routes', 'ship_name', 'cabin_count', 'capacity',
  // Hierarchical fields (company -> property relationship)
  'is_property', 'parent_supplier_id'
]

// Filter object to only include valid fields
function filterValidFields(obj: Record<string, any>): Record<string, any> {
  const filtered: Record<string, any> = {}
  for (const key of VALID_FIELDS) {
    if (obj[key] !== undefined) {
      filtered[key] = obj[key]
    }
  }
  return filtered
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const isProperty = searchParams.get('is_property')
    const parentId = searchParams.get('parent_supplier_id')

    let query = supabaseAdmin
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })

    // Support comma-separated types (e.g., type=transport_company,transport,driver)
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(Boolean)
      if (types.length === 1) {
        query = query.eq('type', types[0])
      } else if (types.length > 1) {
        query = query.in('type', types)
      }
    }
    
    if (status) {
      query = query.eq('status', status)
    }

    // Filter by is_property (true = individual properties, false = parent companies)
    if (isProperty === 'true') {
      query = query.eq('is_property', true)
    } else if (isProperty === 'false') {
      query = query.eq('is_property', false)
    }

    // Filter by parent supplier (get all properties under a specific company)
    if (parentId) {
      query = query.eq('parent_supplier_id', parentId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ error: 'Failed to fetch suppliers', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in suppliers GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.name || !body.type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      )
    }

    // Filter to only valid fields and set defaults
    const newSupplier = {
      ...filterValidFields(body),
      country: body.country || 'Egypt',
      status: body.status || 'active',
      is_property: body.is_property || false,
      parent_supplier_id: body.parent_supplier_id || null
    }

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .insert([newSupplier])
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier:', error)
      return NextResponse.json({ error: 'Failed to create supplier', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Error in suppliers POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}