import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: payments, error } = await supabase
      .from('payments')
      .select(`
        *,
        itineraries (
          itinerary_code,
          client_name,
          client_phone,
          client_email,
          total_cost
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    const formattedPayments = payments?.map((p: any) => ({
      ...p,
      itinerary_code: p.itineraries?.itinerary_code,
      client_name: p.itineraries?.client_name,
      client_phone: p.itineraries?.client_phone,
      client_email: p.itineraries?.client_email,
      total_cost: p.itineraries?.total_cost
    }))

    return NextResponse.json({
      success: true,
      data: formattedPayments || []
    })
  } catch (error: any) {
    console.error('GET /api/payments error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    console.log('Recording payment:', body)

    const { data, error } = await supabase
      .from('payments')
      .insert([body])
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('POST /api/payments error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}