import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidReplyToken, isLinkLive } from '@/lib/supplier-reply-link'
import { applySupplierAnswer } from '@/lib/bookings/supplier-answer'

/**
 * The supplier's tap (lib/supplier-reply-link). Token-authenticated — the
 * supplier has no login — and on the middleware self-auth allowlist. The
 * token resolves to one live link on one service booking; tenant, booking and
 * line all come from that row, so the body can only say the ANSWER: accept,
 * decline, or the car's plate / the guide (+ an optional driver note).
 * Applied by lib/bookings/supplier-answer (shared with the supplier's page).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!isValidReplyToken(token)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    const db = createAdminClient() as unknown as SupabaseClient

    const { data: link } = await db
      .from('service_booking_links')
      .select('id, tenant_id, booking_id, service_booking_id, revoked_at, expires_at')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle()
    if (!link || !isLinkLive(link, new Date())) {
      return NextResponse.json({ success: false, error: 'This link has expired — please contact the agency' }, { status: 404 })
    }

    const { data: line } = await db
      .from('booking_supplier_status')
      .select('id, status, supplier_type, supplier_name, service_description')
      .eq('id', link.service_booking_id)
      .eq('tenant_id', link.tenant_id)
      .maybeSingle()
    if (!line) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const result = await applySupplierAnswer(
      db, { tenantId: link.tenant_id, bookingId: link.booking_id, line, via: 'link' }, await request.json().catch(() => ({})),
    )
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, status: result.status })
  } catch (error) {
    console.error('[reply] error:', error)
    return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  }
}
