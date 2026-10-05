import { NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { assignableCruises, type NileCruiseRow } from '@/lib/resources/assignable'

// GET /api/cruises/assignable — one entry per ship per route, built from
// Rates → Nile Cruises (nile_cruises holds a row per cabin and season;
// lib/resources/assignable.ts). Same tenant scoping as GET /api/cruises.

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const { data, error } = await createAdminClient()
    .from('nile_cruises')
    .select('id, property_id, ship_name, route_name, embark_city, disembark_city, is_active')
    .eq('tenant_id', auth.tenant_id!)

  if (error) {
    console.error('assignable cruises: read failed:', error.message)
    return NextResponse.json({ success: false, error: 'Could not load cruises' }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: assignableCruises((data ?? []) as NileCruiseRow[]) })
}
