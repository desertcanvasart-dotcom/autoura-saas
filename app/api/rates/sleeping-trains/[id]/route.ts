import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase client (avoids build-time errors when env vars unavailable)
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await getSupabaseAdmin()
      .from('sleeping_train_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET sleeping_train_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const updateData: Record<string, any> = {}

    if (body.service_code !== undefined) updateData.service_code = body.service_code
    if (body.origin_city !== undefined) updateData.origin_city = body.origin_city || null
    if (body.destination_city !== undefined) updateData.destination_city = body.destination_city || null
    if (body.cabin_type !== undefined) updateData.cabin_type = body.cabin_type || null
    if (body.rate_oneway_eur !== undefined) updateData.rate_oneway_eur = parseFloat(body.rate_oneway_eur) || 0
    if (body.rate_roundtrip_eur !== undefined) updateData.rate_roundtrip_eur = body.rate_roundtrip_eur ? parseFloat(body.rate_roundtrip_eur) : null
    if (body.departure_time !== undefined) updateData.departure_time = body.departure_time || null
    if (body.arrival_time !== undefined) updateData.arrival_time = body.arrival_time || null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if (body.season !== undefined) updateData.season = body.season || null
    if (body.operator_name !== undefined) updateData.operator_name = body.operator_name || null
    if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null
    if (body.description !== undefined) updateData.description = body.description || null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await getSupabaseAdmin()
      .from('sleeping_train_rates')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT sleeping_train_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await getSupabaseAdmin()
      .from('sleeping_train_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE sleeping_train_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}