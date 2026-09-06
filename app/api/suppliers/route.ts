import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import type { TablesInsert } from '@/types/database.types'
import { supplierTypeKeysForBehaviors } from '@/lib/vocabulary-server'

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

    // Use authenticated client - RLS automatically filters by tenant_id
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    let query = supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })

    // Support comma-separated types (e.g., type=transport_company,transport,driver).
    // A type here is a BEHAVIOUR as much as a key: the tenant's own supplier
    // types that behave as `hotel` (Settings → Your vocabulary) are hotels to
    // the hotel rates page.
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(Boolean)
      const keys = await supplierTypeKeysForBehaviors(supabase, types)
      if (keys.length === 1) {
        query = query.eq('type', keys[0])
      } else if (keys.length > 1) {
        query = query.in('type', keys)
      }
    }

    if (status) {
      query = query.eq('status', status)
    }

    // The is_property / parent_supplier_id filters are gone with the columns
    // (the supplier-IS-a-property model retired by migration 311); a
    // supplier's assets now live in supplier_properties.

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
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    if (!body.name || !body.type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      )
    }

    // Filter to only valid fields and set defaults
    const newSupplier: TablesInsert<'suppliers'> = {
      tenant_id, // ✅ Explicit tenant_id
      ...filterValidFields(body),
      // company_name is NOT NULL in the DB; mirror the legacy name column
      company_name: body.name,
      country: body.country || 'Egypt',
      status: body.status || 'active'
    }

    const { data, error } = await supabase
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