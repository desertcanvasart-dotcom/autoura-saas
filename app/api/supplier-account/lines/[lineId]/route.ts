import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { SESSION_COOKIE } from '@/lib/supplier-accounts'
import { approvedLinks, supplierFromToken } from '@/lib/supplier-session'
import { applySupplierAnswer } from '@/lib/bookings/supplier-answer'

/**
 * A tap in the signed-in supplier's inbox (Phase 2B). Authenticated by the
 * supplier session cookie (middleware self-auth prefix /api/supplier-account/):
 * the line must be a supplier record this account's agency CONFIRMED (an
 * approved claim), at that agency, and not one the agency covers itself.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ lineId: string }> }) {
  try {
    const { lineId } = await params
    const db = createAdminClient() as unknown as SupabaseClient
    const signedIn = await supplierFromToken(db, request.cookies.get(SESSION_COOKIE)?.value)
    if (!signedIn) return NextResponse.json({ success: false, error: 'Please sign in again' }, { status: 401 })

    const links = await approvedLinks(db, signedIn.account.id)
    const { data: line } = await db.from('booking_supplier_status')
      .select('id, tenant_id, booking_id, supplier_id, status, supplier_type, supplier_name, service_description, resource_kind')
      .eq('id', lineId).maybeSingle()
    const allowed = line && line.resource_kind !== 'own' && links.some(l => l.tenant_id === line.tenant_id && l.supplier_id === line.supplier_id)
    if (!line || !allowed) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const result = await applySupplierAnswer(
      db, { tenantId: line.tenant_id, bookingId: line.booking_id, line, via: 'link' }, await request.json().catch(() => ({})),
    )
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, status: result.status })
  } catch (error) {
    console.error('[supplier inbox] answer:', error)
    return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  }
}
