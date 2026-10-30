import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSuperAdmin } from '@/lib/super-admin'

// ============================================
// Network suppliers for the Autoura team to check (Phase 3, decision §7)
// ============================================
// GET ?status=pending|verified|rejected|unverified|all → profiles with the
// account's phone, their papers (no storage paths) and how many agencies have
// them on their book. Super admins only.

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const db = auth.adminClient as unknown as SupabaseClient
  const status = request.nextUrl.searchParams.get('status') ?? 'pending'

  let q = db.from('supplier_network_profiles')
    .select('account_id, display_name, kinds, cities, languages, about, listed, verification_status, verification_note, verified_at, updated_at')
    .order('updated_at', { ascending: false }).limit(200)
  if (status !== 'all') q = q.eq('verification_status', status)
  const { data: profiles, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  const ids = (profiles ?? []).map(p => p.account_id as string)
  if (ids.length === 0) return NextResponse.json({ success: true, data: [] })

  const [{ data: accounts }, { data: papers }, { data: copies }] = await Promise.all([
    db.from('supplier_accounts').select('id, phone, last_login_at, disabled_at').in('id', ids),
    db.from('supplier_network_documents').select('id, account_id, kind, title, mime_type, size_bytes, uploaded_at').in('account_id', ids).order('uploaded_at', { ascending: false }),
    db.from('suppliers').select('network_account_id').in('network_account_id', ids),
  ])
  return NextResponse.json({
    success: true,
    data: (profiles ?? []).map(p => {
      const acc = (accounts ?? []).find(a => a.id === p.account_id)
      return {
        ...p,
        phone: acc?.phone ? `+${acc.phone}` : null,
        account_disabled: !!acc?.disabled_at,
        papers: (papers ?? []).filter(d => d.account_id === p.account_id),
        agencies: (copies ?? []).filter(c => c.network_account_id === p.account_id).length,
      }
    }),
  })
}
