import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/supabase-server'
import { resolveReplyLink } from '@/lib/supplier-link-lookup'
import { applySupplierAnswer } from '@/lib/bookings/supplier-answer'
import { supplierLinkLimited } from '@/lib/supplier-rate-limits'

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
    const limited = await supplierLinkLimited(request)
    if (limited) return limited
    const { token } = await params
    const db = adminDb()
    const link = await resolveReplyLink(db, token)
    if (!link) {
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
