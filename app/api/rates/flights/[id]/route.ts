import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// FLIGHT RATES API - Single Record
// File: app/api/rates/flights/[id]/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Single flight rate by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('flight_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET flight_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: 'Flight rate not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET flight_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update single flight rate
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Remove id from body to avoid conflicts
    const { id: _, ...updates } = body

    // Regenerate route_name if route fields changed
    if (updates.route_from || updates.route_to) {
      const { data: current } = await supabaseAdmin
        .from('flight_rates')
        .select('*')
        .eq('id', id)
        .single()

      if (current) {
        const merged = { ...current, ...updates }
        updates.route_name = updates.route_name || `${merged.route_from} to ${merged.route_to}`
      }
    }

    // Parse numeric fields
    if (updates.base_rate_eur !== undefined) {
      updates.base_rate_eur = parseFloat(updates.base_rate_eur) || 0
    }
    if (updates.base_rate_non_eur !== undefined) {
      updates.base_rate_non_eur = parseFloat(updates.base_rate_non_eur) || 0
    }
    if (updates.tax_eur !== undefined) {
      updates.tax_eur = parseFloat(updates.tax_eur) || 0
    }
    if (updates.tax_non_eur !== undefined) {
      updates.tax_non_eur = parseFloat(updates.tax_non_eur) || 0
    }
    if (updates.duration_minutes !== undefined) {
      updates.duration_minutes = updates.duration_minutes ? parseInt(updates.duration_minutes) : null
    }
    if (updates.baggage_kg !== undefined) {
      updates.baggage_kg = updates.baggage_kg ? parseInt(updates.baggage_kg) : null
    }
    if (updates.carry_on_kg !== undefined) {
      updates.carry_on_kg = updates.carry_on_kg ? parseInt(updates.carry_on_kg) : null
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('flight_rates')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT flight_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT flight_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// DELETE - Delete single flight rate
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('flight_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE flight_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE flight_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}