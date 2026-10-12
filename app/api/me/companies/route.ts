import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, createAdminClient } from '@/lib/supabase-server'
import { currentTenantId, type MembershipDb } from '@/lib/current-membership'

// ============================================
// /api/me/companies — the companies this login works in
// ============================================
// GET  — every company the person is an ACTIVE member of, with their role
//        there and which one is current (the database's answer, the one RLS
//        uses).
// POST — { tenant_id } makes that company current: it is saved on the
//        person's profile (user_profiles.active_tenant_id, migration 414) and
//        get_user_tenant_id() — every RLS policy, every route, every page —
//        follows it from the next request. Only a company they are an active
//        member of is accepted.
//
/** Postgres 42703 / PostgREST PGRST204: the column is not there yet. */
function columnMissing(error: { code?: string; message?: string } | null, column: string): boolean {
  if (!error) return false
  return (error.code === '42703' || error.code === 'PGRST204') && String(error.message ?? '').includes(column)
}

// The admin client reads company names and writes the choice, because a
// company's row is readable only from inside it; both are pinned to the
// signed-in user's own memberships.

export const dynamic = 'force-dynamic'

async function signedIn() {
  const supabase = await createAuthenticatedClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

async function activeMemberships(userId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tenant_members')
    .select('tenant_id, role, joined_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
  if (error) throw error
  const rows = data ?? []
  const ids = rows.map(r => r.tenant_id).filter((id): id is string => !!id)
  const { data: tenants, error: tErr } = ids.length
    ? await admin.from('tenants').select('id, company_name, logo_url').in('id', ids)
    : { data: [], error: null }
  if (tErr) throw tErr
  const byId = new Map((tenants ?? []).map(t => [t.id, t]))
  return rows
    .filter(r => r.tenant_id)
    .map(r => ({
      tenant_id: r.tenant_id as string,
      role: r.role,
      company_name: byId.get(r.tenant_id as string)?.company_name ?? 'Company',
      logo_url: byId.get(r.tenant_id as string)?.logo_url ?? null,
    }))
}

export async function GET() {
  try {
    const { supabase, user } = await signedIn()
    if (!user) return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })

    const [companies, current] = await Promise.all([
      activeMemberships(user.id),
      currentTenantId(supabase as unknown as MembershipDb),
    ])
    return NextResponse.json({ success: true, data: { companies, current: current.tenantId } })
  } catch (error) {
    console.error('GET /api/me/companies error:', error)
    return NextResponse.json({ success: false, error: 'Could not load your companies' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await signedIn()
    if (!user) return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as { tenant_id?: unknown }
    const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : ''
    const companies = await activeMemberships(user.id)
    const target = companies.find(c => c.tenant_id === tenantId)
    if (!target) {
      return NextResponse.json({ success: false, error: 'You are not an active member of that company' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('user_profiles')
      .update({ active_tenant_id: tenantId })
      .eq('id', user.id)
    if (error) {
      if (columnMissing(error, 'active_tenant_id')) {
        return NextResponse.json(
          { success: false, error: 'Switching companies needs a database update (migration 414). Ask your administrator to apply it.' },
          { status: 503 },
        )
      }
      throw error
    }
    return NextResponse.json({ success: true, data: { current: tenantId, company_name: target.company_name } })
  } catch (error) {
    console.error('POST /api/me/companies error:', error)
    return NextResponse.json({ success: false, error: 'Could not switch company' }, { status: 500 })
  }
}
