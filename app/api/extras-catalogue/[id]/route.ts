// PUT/DELETE one catalogue extra. Scoped by org as well as id, so an extra can
// never be edited across organisations.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const COLS =
  'id, tenant_id, name, description, category, supplier_cost, supplier_id, selling_price, unit, is_active, created_at, updated_at'

const WRITABLE = [
  'name', 'description', 'category', 'supplier_cost', 'supplier_id',
  'selling_price', 'unit', 'is_active',
] as const

function numberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id } = await params

    const body = await request.json()
    const record: Record<string, unknown> = {}
    for (const k of WRITABLE) {
      if (!(k in body)) continue
      record[k] = k === 'supplier_cost' || k === 'selling_price' ? numberOrNull(body[k]) : body[k]
    }
    if ('name' in record) {
      record.name = String(record.name ?? '').trim()
      if (!record.name) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }
    record.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('extras_catalogue')
      .update(record)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select(COLS)
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'An extra with that name already exists' }, { status: 409 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ success: false, error: 'Extra not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PUT extras-catalogue:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the extra' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id } = await params

    // Extras already added to a booking keep their own copy of title and
    // price (booking_extras stores them), so deleting a catalogue row cannot
    // rewrite history — it only stops the extra being offered again.
    const { data, error } = await supabase
      .from('extras_catalogue')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Extra not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE extras-catalogue:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete the extra' }, { status: 500 })
  }
}
