// ============================================
// /api/suppliers/[id]/properties — the assets a supplier operates
// ============================================
// GET  — list a supplier's properties (?type=ship&active_only=true)
// POST — add one (name + property_type required)
//
// Tenant-scoped: every read/write rides the caller's RLS client, and the
// insert stamps tenant_id explicitly (NOT NULL + tenant policy CHECK).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { PROPERTY_TYPES, type PropertyType } from '@/lib/supplier-properties'

const COLS = 'id, tenant_id, supplier_id, property_type, name, city, category, contact_name, contact_phone, contact_email, notes, is_active, created_at, updated_at'

const WRITABLE = ['property_type', 'name', 'city', 'category', 'contact_name', 'contact_phone', 'contact_email', 'notes', 'is_active'] as const

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id } = await params
    const sp = request.nextUrl.searchParams
    let query = supabase
      .from('supplier_properties')
      .select(COLS)
      .eq('supplier_id', id)
      .order('property_type')
      .order('name')
    const type = sp.get('type')
    if (type) query = query.eq('property_type', type)
    if (sp.get('active_only') === 'true') query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('GET supplier properties error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const record: Record<string, unknown> = {}
    for (const k of WRITABLE) if (k in body) record[k] = body[k]

    const name = String(record.name ?? '').trim()
    if (!name) return NextResponse.json({ success: false, error: 'Property name is required' }, { status: 400 })
    if (!PROPERTY_TYPES.includes(record.property_type as PropertyType)) {
      return NextResponse.json({ success: false, error: `property_type must be one of: ${PROPERTY_TYPES.join(', ')}` }, { status: 400 })
    }

    // The supplier must exist IN THIS TENANT (RLS scopes the read).
    const { data: supplier } = await supabase.from('suppliers').select('id').eq('id', id).maybeSingle()
    if (!supplier) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })

    // Typed literal, not a spread: the generated Insert type needs to SEE
    // property_type and name as present.
    const { data, error } = await supabase
      .from('supplier_properties')
      .insert({
        tenant_id,
        supplier_id: id,
        property_type: record.property_type as PropertyType,
        name,
        city: (record.city as string | null) ?? null,
        category: (record.category as string | null) ?? null,
        contact_name: (record.contact_name as string | null) ?? null,
        contact_phone: (record.contact_phone as string | null) ?? null,
        contact_email: (record.contact_email as string | null) ?? null,
        notes: (record.notes as string | null) ?? null,
        is_active: record.is_active === undefined ? true : Boolean(record.is_active),
      })
      .select(COLS)
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: `This supplier already has a ${record.property_type} named "${name}"` }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST supplier property error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
