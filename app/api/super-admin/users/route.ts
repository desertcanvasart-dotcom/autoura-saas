import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    let query = admin.from('user_profiles').select('*').order('created_at', { ascending: false })
    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
    }
    const { data: users, error } = await query
    if (error) throw error

    // Get tenant memberships
    const { data: memberships } = await admin.from('tenant_members').select('user_id, tenant_id, role, status, tenant:tenants(company_name)')

    const membershipMap: Record<string, any> = {}
    for (const m of memberships || []) {
      membershipMap[m.user_id] = {
        tenantId: m.tenant_id,
        tenantName: (m as any).tenant?.company_name || 'Unknown',
        role: m.role,
        status: m.status,
      }
    }

    const enriched = (users || []).map(u => ({
      ...u,
      membership: membershipMap[u.id] || null,
    }))

    return NextResponse.json({ success: true, data: enriched, count: enriched.length })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
