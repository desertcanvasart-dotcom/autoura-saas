import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params

    // tenant_members.user_id references auth.users, and no FK to
    // user_profiles exists — the old `user:user_profiles(...)` embed made
    // PostgREST reject the whole query (PGRST200, the exact incident
    // postgrest-embed-hints.test.ts was written about), its error was
    // swallowed, and the member list rendered empty. Profiles are joined in
    // a second query instead (user_profiles.id mirrors auth.users.id).
    const [tenantRes, membersRes, featuresRes, subRes, activityRes, usageRes] = await Promise.all([
      admin.from('tenants').select('*').eq('id', id).single(),
      admin.from('tenant_members').select('id, tenant_id, user_id, role, status, invited_by, invited_at, joined_at, created_at, updated_at').eq('tenant_id', id).order('joined_at', { ascending: false }),
      admin.from('tenant_features').select('*').eq('tenant_id', id).maybeSingle(),
      admin.from('tenant_subscriptions').select('*, plan:subscription_plans(name, slug, price_monthly, price_yearly)').eq('tenant_id', id).maybeSingle(),
      admin.from('tenant_activity_logs').select('*').eq('tenant_id', id).order('created_at', { ascending: false }).limit(20),
      admin.from('tenant_usage').select('*').eq('tenant_id', id).order('period_start', { ascending: false }).limit(1),
    ])

    if (tenantRes.error) throw tenantRes.error

    const memberRows = membersRes.data ?? []
    const memberUserIds = [...new Set(memberRows.map(m => m.user_id).filter(Boolean))] as string[]
    const { data: profiles } = memberUserIds.length
      ? await admin.from('user_profiles').select('id, email, full_name, role, is_active').in('id', memberUserIds)
      : { data: [] }
    const profileById = new Map((profiles ?? []).map(p => [p.id, p]))
    const members = memberRows.map(m => ({
      ...m,
      // The shape the embed was supposed to produce.
      user: (m.user_id && profileById.get(m.user_id)) || null,
    }))

    return NextResponse.json({
      success: true,
      data: {
        tenant: tenantRes.data,
        members,
        features: featuresRes.data || null,
        subscription: subRes.data || null,
        recentActivity: activityRes.data || [],
        usage: usageRes.data?.[0] || null,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params
    const body = await request.json()

    const allowedFields = ['company_name', 'contact_email', 'workspace_mode', 'timezone', 'currency', 'locale']
    const updates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    // Handle deactivation
    if (body.deactivate === true) {
      await admin.from('tenant_members').update({ status: 'suspended' }).eq('tenant_id', id)
    }
    if (body.reactivate === true) {
      await admin.from('tenant_members').update({ status: 'active' }).eq('tenant_id', id).eq('status', 'suspended')
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString()
      const { error } = await admin.from('tenants').update(updates).eq('id', id)
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
