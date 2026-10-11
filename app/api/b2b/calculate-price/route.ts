import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { priceVariation } from '@/lib/b2b/price-variation'

// ============================================
// B2B TOUR PRICE CALCULATOR
// The engine is lib/b2b/price-variation: the calculator's quote save re-runs
// it, so this route and the save price a variation identically.
// ============================================

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }
  const body = await request.json()
  const priced = await priceVariation(authResult.tenant_id, body)
  return NextResponse.json(priced.body, { status: priced.status })
}

// GET endpoint for simple queries
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }

  const { searchParams } = new URL(request.url)
  const variation_id = searchParams.get('variation_id')
  const num_pax = parseInt(searchParams.get('num_pax') || '2')
  const travel_date = searchParams.get('travel_date') || new Date().toISOString().split('T')[0]
  const is_eur = searchParams.get('is_eur') !== 'false'
  const margin = parseFloat(searchParams.get('margin') || '25')
  const tour_leader = searchParams.get('tour_leader') === 'true'  // NEW

  if (!variation_id) {
    return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
  }

  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ 
      variation_id, 
      num_pax, 
      travel_date, 
      is_eur_passport: is_eur, 
      margin_percent: margin,
      tour_leader_included: tour_leader  // NEW
    })
  })

  return POST(mockRequest)
}