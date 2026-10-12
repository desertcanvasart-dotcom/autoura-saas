import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, createAdminClient, requireAuth } from '@/lib/supabase-server'
import { gateRole } from '@/lib/api-role-gate'
import { SUPPLIER_CONTRACTS_BUCKET } from '@/lib/supplier-contracts'

// All valid supplier fields (including new ones from migration)
const VALID_FIELDS = [
  'name', 'type', 'types', 'contact_name', 'contact_email', 'contact_phone',
  'phone2', 'whatsapp', 'website', 'address', 'city', 'country',
  'default_commission_rate', 'commission_type', 'payment_terms',
  'bank_details', 'status', 'notes',
  // Type-specific fields
  'languages', 'vehicle_types', 'star_rating', 'property_type',
  'cuisine_types', 'routes', 'ship_name', 'cabin_count', 'capacity',
  // Hierarchical fields
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching supplier:', error)
      return NextResponse.json({ error: 'Supplier not found', details: error.message }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in supplier GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const roleGate = await gateRole('manage')
    if (roleGate) return roleGate
    const { id } = await params

    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Filter to only valid fields to prevent database errors
    // One or more roles (340): the list wins, the primary is its first entry.
    if (Array.isArray(body.types) && body.types.length) {
      body.types = body.types.map(String).filter(Boolean)
      body.type = body.types[0]
    }
    const updateData = filterValidFields(body)

    // Remove fields that shouldn't be updated
    delete (updateData as any).id
    delete (updateData as any).tenant_id
    delete (updateData as any).created_at
    delete (updateData as any).updated_at

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating supplier:', error)
      return NextResponse.json({ error: 'Failed to update supplier', details: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in supplier PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const roleGate = await gateRole('manage')
    if (roleGate) return roleGate
    const { id } = await params

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

    // Check if supplier exists first
    const { data: existing } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // Its properties go with it (ON DELETE CASCADE), and a rate priced on one
    // of them would have its property link nulled without a word — the very
    // thing deleting a single property refuses. Refused the same way here.
    const { data: props } = await supabase.from('supplier_properties').select('id').eq('supplier_id', id)
    const propertyIds = (props ?? []).map(p => p.id as string)
    if (propertyIds.length > 0) {
      const counts = await Promise.all(
        (['nile_cruises', 'accommodation_rates', 'train_rates', 'sleeping_train_rates'] as const).map(t =>
          supabase.from(t).select('id', { count: 'exact', head: true }).in('property_id', propertyIds)
        )
      )
      const inUse = counts.reduce((n, c) => n + (c.count ?? 0), 0)
      if (inUse > 0) {
        return NextResponse.json(
          { success: false, error: `${inUse} rate(s) are priced on this supplier's ships, hotels or trains. Delete those rates first, or mark the supplier inactive.` },
          { status: 409 }
        )
      }
    }

    // Its contract files: the rows cascade away, the files in the private
    // bucket did not — orphans nothing could list or delete afterwards.
    const { data: contracts } = await supabase.from('supplier_contracts').select('storage_path').eq('supplier_id', id)
    const paths = (contracts ?? []).map(c => c.storage_path as string | null).filter((p): p is string => Boolean(p))

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id)

    if (!error && paths.length > 0) {
      const { error: removeError } = await createAdminClient().storage.from(SUPPLIER_CONTRACTS_BUCKET).remove(paths)
      if (removeError) console.error('[suppliers DELETE] contract files left in storage:', removeError.message)
    }

    if (error) {
      console.error('Error deleting supplier:', error)
      return NextResponse.json({ error: 'Failed to delete supplier', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `Supplier "${existing.name}" deleted` })
  } catch (error) {
    console.error('Error in supplier DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}