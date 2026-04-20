import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params

    const [tenantRes, membersRes, featuresRes, subRes, activityRes, usageRes] = await Promise.all([
      admin.from('tenants').select('*').eq('id', id).single(),
      admin.from('tenant_members').select('*, user:user_profiles(email, full_name, role, is_active)').eq('tenant_id', id).order('joined_at', { ascending: false }),
      admin.from('tenant_features').select('*').eq('tenant_id', id).maybeSingle(),
      admin.from('tenant_subscriptions').select('*, plan:subscription_plans(name, slug, price_monthly, price_yearly)').eq('tenant_id', id).maybeSingle(),
      admin.from('tenant_activity_logs').select('*').eq('tenant_id', id).order('created_at', { ascending: false }).limit(20),
      admin.from('tenant_usage').select('*').eq('tenant_id', id).order('period_start', { ascending: false }).limit(1),
    ])

    if (tenantRes.error) throw tenantRes.error

    return NextResponse.json({
      success: true,
      data: {
        tenant: tenantRes.data,
        members: membersRes.data || [],
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
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params
    const body = await request.json()

    const allowedFields = ['company_name', 'contact_email', 'business_type', 'timezone', 'currency']
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
