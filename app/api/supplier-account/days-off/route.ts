import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { SESSION_COOKIE } from '@/lib/supplier-accounts'
import { approvedLinks, supplierFromToken } from '@/lib/supplier-session'
import { checkDayOff, cleanNote } from '@/lib/supplier-days-off'

/**
 * Days off from the signed-in inbox (Phase 2B). Session cookie; the body
 * names the agency by its approved claim (link_id) — never a tenant or
 * supplier id the account could pick. POST { link_id, day, note? } marks it;
 * DELETE { link_id, day } removes a day the supplier marked.
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
  const checked = checkDayOff(body.day, new Date().toISOString().slice(0, 10))
  if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })
  const { error } = await db.from('supplier_unavailable_days').upsert(
    { tenant_id: found.link.tenant_id, supplier_id: found.link.supplier_id, day: checked.day, note: cleanNote(body.note), marked_by: 'supplier' },
    { onConflict: 'tenant_id,supplier_id,day', ignoreDuplicates: true },
  )
  if (error) return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const db = createAdminClient() as unknown as SupabaseClient
  const body = await request.json().catch(() => ({}))
  const found = await linkFor(request, db, body.link_id)
  if ('error' in found) return found.error
  if (typeof body.day !== 'string') return NextResponse.json({ success: false, error: 'Choose a date' }, { status: 400 })
  const { error } = await db.from('supplier_unavailable_days').delete()
    .eq('tenant_id', found.link.tenant_id).eq('supplier_id', found.link.supplier_id).eq('day', body.day).eq('marked_by', 'supplier')
  if (error) return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  return NextResponse.json({ success: true })
}
