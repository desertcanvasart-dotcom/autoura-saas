// POST /api/tours/transport-preview — each day's transport, as pricing WILL
// price it, for the Tour Manager's day editor (sibling #454). Runs the
// engine's own steps over the editor's current, unsaved days: nothing the
// editor shows can disagree with the calculator.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { previewDayTransport } from '@/lib/auto-pricing-service'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const body = await request.json().catch(() => ({}))
    const days = Array.isArray(body.itinerary) ? body.itinerary.slice(0, 60) : []
    const pax = Number.isInteger(body.pax) && body.pax >= 1 && body.pax <= 60 ? body.pax : 2
    const data = await previewDayTransport({ tenantId: auth.tenant_id! }, days, { tourType: body.tour_type ?? null, pax, throughoutGuide: body.throughout_guide === true })
    return NextResponse.json({ success: true, data, pax })
  } catch (err) {
    console.error('[transport-preview]', err)
    return NextResponse.json({ success: false, error: 'Could not preview the transport' }, { status: 500 })
  }
}
