// PUT/DELETE one supplier property. Scoped by BOTH ids (and by RLS to the
// caller's tenant), so a property can never be edited through the wrong
// supplier's URL.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

const COLS = 'id, tenant_id, supplier_id, property_type, name, city, category, contact_name, contact_phone, contact_email, notes, is_active, created_at, updated_at'

const WRITABLE = ['property_type', 'name', 'city', 'category', 'contact_name', 'contact_phone', 'contact_email', 'notes', 'is_active'] as const

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id, propertyId } = await params
    const body = await request.json()
    const record: Record<string, unknown> = {}
    for (const k of WRITABLE) if (k in body) record[k] = body[k]
    if ('name' in record) {
      record.name = String(record.name ?? '').trim()
      if (!record.name) return NextResponse.json({ success: false, error: 'Property name is required' }, { status: 400 })
    }
    record.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('supplier_properties')
      .update(record)
      .eq('id', propertyId)
      .eq('supplier_id', id)
      .select(COLS)
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'This supplier already has a property with that name' }, { status: 409 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 })

    // Write-through: rate rows display the ship from their own denormalized
    // column, so a rename must follow into them or the two drift apart.
    if ('name' in record && data.property_type === 'ship') {
      await supabase.from('nile_cruises').update({ ship_name: data.name }).eq('property_id', propertyId)
    }
    if ('name' in record && data.property_type === 'hotel') {
      await supabase.from('accommodation_rates').update({ property_name: data.name }).eq('property_id', propertyId)
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PUT supplier property error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id, propertyId } = await params

    // Refuse while rates still reference it: deleting the ship under priced
    // rows would null property_id silently and strand them. Deactivate
    // instead, or delete the rates first.
    const counts = await Promise.all([
      supabase.from('nile_cruises').select('id', { count: 'exact', head: true }).eq('property_id', propertyId),
      supabase.from('accommodation_rates').select('id', { count: 'exact', head: true }).eq('property_id', propertyId),
      supabase.from('train_rates').select('id', { count: 'exact', head: true }).eq('property_id', propertyId),
      supabase.from('sleeping_train_rates').select('id', { count: 'exact', head: true }).eq('property_id', propertyId),
    ])
    const inUse = counts.reduce((n, c) => n + (c.count ?? 0), 0)
    if (inUse > 0) {
      return NextResponse.json(
        { success: false, error: `${inUse} rate(s) still use this property. Delete those rates first, or mark the property inactive.` },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('supplier_properties')
      .delete()
      .eq('id', propertyId)
      .eq('supplier_id', id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE supplier property error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
