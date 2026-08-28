// GET /api/bookings/[id]/change-requests — the office's view of what the
// lead asked for. RLS-scoped read; absent table (migration 302 pending)
// degrades to an empty list.

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    const { id } = await params

    const { data, error } = await supabase
      .from('booking_change_requests')
      .select('id, kind, requested_count, note, requested_via, status, created_at, resolved_at')
      .eq('booking_id', id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ success: true, requests: [] })
    return NextResponse.json({ success: true, requests: data ?? [] })
  } catch {
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
  }
}
