// GET /api/pricing-grid/rates?tier=standard&date=YYYY-MM-DD
// All available rate options, structured by grid slot for the dropdowns
// (lib/pricing/grid-rates — the same lists a grid save prices from).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { loadGridRates } from '@/lib/pricing/grid-rates'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Auth failed' },
        { status: authResult.status || 401 }
      )
    }
    const { searchParams } = new URL(request.url)
    const rates = await loadGridRates(authResult.supabase, authResult.tenant_id!, {
      tier: searchParams.get('tier'),
      startDate: searchParams.get('date'),
    })
    return NextResponse.json({ success: true, data: rates })
  } catch (error: any) {
    console.error('Failed to fetch grid rates:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
