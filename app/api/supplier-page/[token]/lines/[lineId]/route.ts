import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidSupplierPageToken } from '@/lib/supplier-portal'
import { applySupplierAnswer } from '@/lib/bookings/supplier-answer'

/**
 * A tap on the supplier's own page (lib/supplier-portal, migration 449).
 * Token-authenticated and on the middleware self-auth allowlist: the token
 * resolves to one unrevoked link = one supplier at one agency, and the line
 * must be that supplier's, at that agency, not covered by the agency itself.
 * The body can only say the answer; applied by lib/bookings/supplier-answer.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string; lineId: string }> }) {
  try {
    const { token, lineId } = await params
    if (!isValidSupplierPageToken(token)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    const db = createAdminClient() as unknown as SupabaseClient

    const { data: link } = await db
      .from('supplier_portal_links')
      .select('id, tenant_id, supplier_id, revoked_at')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle()
    if (!link) return NextResponse.json({ success: false, error: 'This link no longer works — please contact the agency' }, { status: 404 })

    const { data: line } = await db
      .from('booking_supplier_status')
      .select('id, booking_id, status, supplier_type, supplier_name, service_description, resource_kind')
      .eq('id', lineId)
      .eq('tenant_id', link.tenant_id)
      .eq('supplier_id', link.supplier_id)
      .maybeSingle()
    if (!line || line.resource_kind === 'own') return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const result = await applySupplierAnswer(
      db, { tenantId: link.tenant_id, bookingId: line.booking_id, line, via: 'link' }, await request.json().catch(() => ({})),
    )
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, status: result.status })
  } catch (error) {
    console.error('[supplier page] error:', error)
    return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  }
}
