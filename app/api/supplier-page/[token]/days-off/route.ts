import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidSupplierPageToken } from '@/lib/supplier-portal'
import { checkDayOff, cleanNote } from '@/lib/supplier-days-off'
import { notifyTeam } from '@/lib/notifications'
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

const today = () => new Date().toISOString().slice(0, 10)

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await supplierLinkLimited(request)
  if (limited) return limited
  const { token } = await params
  const db = createAdminClient() as unknown as SupabaseClient
  const link = await linkFor(db, token)
  if (!link) return NextResponse.json({ success: false, error: 'This link no longer works — please contact the agency' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const checked = checkDayOff(body.day, today())
  if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })

  const { error } = await db.from('supplier_unavailable_days').upsert(
    { tenant_id: link.tenant_id, supplier_id: link.supplier_id, day: checked.day, note: cleanNote(body.note), marked_by: 'supplier' },
    { onConflict: 'tenant_id,supplier_id,day', ignoreDuplicates: true },
  )
  if (error) return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })

  const { data: supplier } = await db.from('suppliers').select('name, company_name').eq('id', link.supplier_id).maybeSingle()
  void notifyTeam({
    tenant_id: link.tenant_id,
    dedupe_key: `supplier-day-off:${link.supplier_id}:${checked.day}`,
    type: 'supplier',
    title: `${(supplier?.name || supplier?.company_name) ?? 'A supplier'} is not available on ${checked.day}`,
    message: cleanNote(body.note) ?? 'Marked on their page',
    link: '/suppliers',
  }).catch(e => console.error('[days off] notify:', e))
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
  if (typeof body.day !== 'string') return NextResponse.json({ success: false, error: 'Choose a date' }, { status: 400 })
  const { error } = await db.from('supplier_unavailable_days').delete()
    .eq('tenant_id', link.tenant_id).eq('supplier_id', link.supplier_id).eq('day', body.day).eq('marked_by', 'supplier')
  if (error) return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  return NextResponse.json({ success: true })
}
