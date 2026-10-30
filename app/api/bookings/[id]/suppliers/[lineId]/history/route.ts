import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// One service line's history (service_booking_events, migration 446)
// ============================================
// Who did what, when, by which channel — newest first. Read-only; the events
// table is append-only and tenant-scoped by RLS.

type Ctx = { params: Promise<{ id: string; lineId: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id, lineId } = await params

  const { data, error } = await supabase
    .from('service_booking_events')
    .select('id, occurred_at, actor_kind, actor_label, channel, from_status, to_status, note')
    .eq('booking_id', id)
    .eq('service_booking_id', lineId)
    .eq('tenant_id', tenant_id)
    .order('occurred_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
