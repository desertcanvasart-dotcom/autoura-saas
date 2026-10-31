import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidSupplierPageToken } from '@/lib/supplier-portal'
import { clearSupplierDayOff, markSupplierDayOff } from '@/lib/supplier-days-off-write'
import { supplierLinkLimited } from '@/lib/supplier-rate-limits'

/**
 * Days off from the supplier's own page (lib/supplier-days-off, migration
 * 449). Token-authenticated (middleware self-auth prefix /api/supplier-page/):
 * the unrevoked link = one supplier at one agency; the body names only a day.
 * POST { day, note? } marks it; DELETE { day } removes a day THEY marked.
 */
async function linkFor(db: SupabaseClient, token: string) {
  if (!isValidSupplierPageToken(token)) return null
  const { data } = await db.from('supplier_portal_links').select('tenant_id, supplier_id, revoked_at')
    .eq('token', token).is('revoked_at', null).maybeSingle()
  return data
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await supplierLinkLimited(request)
  if (limited) return limited
  const { token } = await params
  const db = createAdminClient() as unknown as SupabaseClient
  const link = await linkFor(db, token)
  if (!link) return NextResponse.json({ success: false, error: 'This link no longer works — please contact the agency' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const done = await markSupplierDayOff(db, { tenantId: link.tenant_id, supplierId: link.supplier_id }, body, { via: 'Marked on their page' })
  if (!done.ok) return NextResponse.json({ success: false, error: done.error }, { status: done.status })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await supplierLinkLimited(request)
  if (limited) return limited
  const { token } = await params
  const db = createAdminClient() as unknown as SupabaseClient
  const link = await linkFor(db, token)
  if (!link) return NextResponse.json({ success: false, error: 'This link no longer works — please contact the agency' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const done = await clearSupplierDayOff(db, { tenantId: link.tenant_id, supplierId: link.supplier_id }, body.day)
  if (!done.ok) return NextResponse.json({ success: false, error: done.error }, { status: done.status })
  return NextResponse.json({ success: true })
}
