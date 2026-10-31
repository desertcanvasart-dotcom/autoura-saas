import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { codeForClaim, codeRecipientsForAgency } from '@/lib/supplier-claims'

// ============================================
// Suppliers asking to sign in as this agency's supplier (Phase 2B, 450)
// ============================================
// GET ?status=pending | ?supplier_id=… → this agency's claims, with the
// supplier's name and the phone they signed in with. The claims are read
// through RLS (this agency's only); the phone lives on supplier_accounts,
// which no signed-in user can read, so it is fetched with the service role
// for exactly those claims' accounts. So is where the sign-in code went —
// cut down to this agency's own addresses and a count of the others.

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

  const status = request.nextUrl.searchParams.get('status')
  const supplierId = request.nextUrl.searchParams.get('supplier_id')
  let q = supabase.from('supplier_account_links').select('id, account_id, supplier_id, status, requested_at, decided_at')
    .eq('tenant_id', tenant_id).order('requested_at', { ascending: false }).limit(200)
  if (status && ['pending', 'approved', 'rejected'].includes(status)) q = q.eq('status', status)
  if (supplierId) q = q.eq('supplier_id', supplierId)
  const { data: claims, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!claims || claims.length === 0) return NextResponse.json({ success: true, data: [] })

  const admin = createAdminClient() as unknown as SupabaseClient
  const accountIds = [...new Set(claims.map(c => c.account_id as string))]
  const [{ data: accounts }, { data: suppliers }, { data: codes }] = await Promise.all([
    admin.from('supplier_accounts').select('id, phone, last_login_at').in('id', accountIds),
    supabase.from('suppliers').select('id, name, company_name, email, contact_email').in('id', [...new Set(claims.map(c => c.supplier_id as string))]).eq('tenant_id', tenant_id),
    // Where each sign-in code went (audit SN-1). Only reduced below to the
    // addresses on THIS agency's own record plus a count of the rest.
    admin.from('supplier_login_codes').select('account_id, sent_to, used_at').in('account_id', accountIds)
      .not('used_at', 'is', null).order('used_at', { ascending: false }).limit(500),
  ])
  return NextResponse.json({
    success: true,
    data: claims.map(c => {
      const acc = (accounts ?? []).find(a => a.id === c.account_id)
      const sup = (suppliers ?? []).find(s => s.id === c.supplier_id)
      return {
        id: c.id, supplier_id: c.supplier_id, status: c.status, requested_at: c.requested_at, decided_at: c.decided_at,
        supplier_name: ((sup?.name || sup?.company_name) as string | null) ?? 'Supplier',
        phone: acc?.phone ? `+${acc.phone}` : null,
        last_login_at: acc?.last_login_at ?? null,
        code_sent_to: codeRecipientsForAgency(
          codeForClaim((codes ?? []) as Array<{ account_id: string; used_at: string; sent_to: string | null }>, { account_id: c.account_id as string, requested_at: c.requested_at as string })?.sent_to,
          sup as { email?: string | null; contact_email?: string | null } | undefined,
        ),
      }
    }),
  })
}
