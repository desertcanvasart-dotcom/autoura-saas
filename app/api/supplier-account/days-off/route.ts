import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { SESSION_COOKIE } from '@/lib/supplier-accounts'
import { approvedLinks, supplierFromToken } from '@/lib/supplier-session'
import { clearSupplierDayOff, markSupplierDayOff } from '@/lib/supplier-days-off-write'

/**
 * Days off from the signed-in inbox (Phase 2B). Session cookie; the body
 * names the agency by its approved claim (link_id) — never a tenant or
 * supplier id the account could pick. POST { link_id, day, note? } marks it;
 * DELETE { link_id, day } removes a day the supplier marked. Same writer as
 * the supplier's page (lib/supplier-days-off-write), so the office is told too.
 */
async function linkFor(request: NextRequest, db: SupabaseClient, linkId: unknown) {
  const signedIn = await supplierFromToken(db, request.cookies.get(SESSION_COOKIE)?.value)
  if (!signedIn) return { error: NextResponse.json({ success: false, error: 'Please sign in again' }, { status: 401 }) }
  const link = (await approvedLinks(db, signedIn.account.id)).find(l => l.id === linkId)
  if (!link) return { error: NextResponse.json({ success: false, error: 'Not found' }, { status: 404 }) }
  return { link }
}

export async function POST(request: NextRequest) {
  const db = createAdminClient() as unknown as SupabaseClient
  const body = await request.json().catch(() => ({}))
  const found = await linkFor(request, db, body.link_id)
  if ('error' in found) return found.error
  const who = { tenantId: found.link.tenant_id, supplierId: found.link.supplier_id }
  const done = await markSupplierDayOff(db, who, body, { via: 'Marked in their inbox' })
  if (!done.ok) return NextResponse.json({ success: false, error: done.error }, { status: done.status })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const db = createAdminClient() as unknown as SupabaseClient
  const body = await request.json().catch(() => ({}))
  const found = await linkFor(request, db, body.link_id)
  if ('error' in found) return found.error
  const done = await clearSupplierDayOff(db, { tenantId: found.link.tenant_id, supplierId: found.link.supplier_id }, body.day)
  if (!done.ok) return NextResponse.json({ success: false, error: done.error }, { status: done.status })
  return NextResponse.json({ success: true })
}
