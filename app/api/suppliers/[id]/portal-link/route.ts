import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { appRedirectBase } from '@/lib/oauth-config'
import { formatPhoneForWhatsApp, generateWhatsAppLink } from '@/lib/communication-utils'
import { buildPortalLinkMessage, generateSupplierPageToken } from '@/lib/supplier-portal'

// ============================================
// A supplier's own page link (lib/supplier-portal, migration 449)
// ============================================
// GET    → the active link, if any (and when it was last opened).
// POST   → make it (or reuse the active one) and the WhatsApp text that sends
//          it from the office's own phone (D2).
// DELETE → switch it off (the supplier's URL stops working); POST makes a new one.

type Ctx = { params: Promise<{ id: string }> }

async function activeLink(db: SupabaseClient, tenantId: string, supplierId: string) {
  const { data } = await db.from('supplier_portal_links').select('id, token, created_at, last_opened_at')
    .eq('tenant_id', tenantId).eq('supplier_id', supplierId).is('revoked_at', null).maybeSingle()
  return data
}

const pageUrl = (request: NextRequest, token: string) => `${appRedirectBase(process.env.NEXT_PUBLIC_APP_URL, request.url)}/supplier/${token}`

export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params
  const link = await activeLink(supabase, tenant_id, id)
  return NextResponse.json({ success: true, data: link ? { url: pageUrl(request, link.token as string), created_at: link.created_at, last_opened_at: link.last_opened_at } : null })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id, user } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params

  const { data: supplier } = await supabase.from('suppliers').select('id, name, company_name, whatsapp, phone, contact_phone')
    .eq('id', id).eq('tenant_id', tenant_id).maybeSingle()
  if (!supplier) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })

  let link = await activeLink(supabase, tenant_id, id)
  if (!link) {
    const { error } = await supabase.from('supplier_portal_links').insert({ tenant_id, supplier_id: id, token: generateSupplierPageToken(), created_by: user?.id ?? null })
    // Two clicks at once: the other one made it.
    link = await activeLink(supabase, tenant_id, id)
    if (!link) return NextResponse.json({ success: false, error: error?.message ?? 'Could not make the link' }, { status: 500 })
  }
  const url = pageUrl(request, link.token as string)

  const { data: tenant } = await supabase.from('tenants').select('company_name, operating_country').eq('id', tenant_id).maybeSingle()
  const message = buildPortalLinkMessage({ supplierName: (supplier.name || supplier.company_name) as string, agency: tenant?.company_name as string | null, url })
  const raw = (supplier.whatsapp || supplier.phone || supplier.contact_phone) as string | null
  const phone = raw ? formatPhoneForWhatsApp(raw, tenant?.operating_country as string | null) : null
  return NextResponse.json({
    success: true,
    data: { url, message, phone, whatsapp_url: phone ? generateWhatsAppLink(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`, last_opened_at: link.last_opened_at },
  })
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params
  const { error } = await supabase.from('supplier_portal_links').update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', tenant_id).eq('supplier_id', id).is('revoked_at', null)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
