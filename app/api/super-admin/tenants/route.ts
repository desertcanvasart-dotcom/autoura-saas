import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    // Fetch all tenants
    let query = admin.from('tenants').select('*').order('created_at', { ascending: false })
    if (search) {
      query = query.or(`company_name.ilike.%${search}%,contact_email.ilike.%${search}%`)
    }
    const { data: tenants, error: tErr } = await query
    if (tErr) throw tErr

    // Fetch member counts per tenant
    const { data: members } = await admin.from('tenant_members').select('tenant_id, status')
    const memberCounts: Record<string, number> = {}
    for (const m of members || []) {
      if (m.status === 'active') {
        memberCounts[m.tenant_id] = (memberCounts[m.tenant_id] || 0) + 1
      }
    }

    // Fetch subscriptions
    const { data: subs } = await admin.from('tenant_subscriptions').select('tenant_id, status, plan_id, current_period_end, trial_ends_at')
    const subMap: Record<string, any> = {}
    for (const s of subs || []) {
      subMap[s.tenant_id] = s
    }

    // Fetch plans for names
    const { data: plans } = await admin.from('subscription_plans').select('id, name, slug, price_monthly')
    const planMap: Record<string, any> = {}
    for (const p of plans || []) {
      planMap[p.id] = p
    }

    // Fetch features
    const { data: features } = await admin.from('tenant_features').select('tenant_id, b2c_enabled, b2b_enabled, max_users')
    const featureMap: Record<string, any> = {}
    for (const f of features || []) {
      featureMap[f.tenant_id] = f
    }

    // Build enriched list
    const enriched = (tenants || []).map(t => {
      const sub = subMap[t.id]
      const plan = sub?.plan_id ? planMap[sub.plan_id] : null
      return {
        ...t,
        memberCount: memberCounts[t.id] || 0,
        subscription: sub ? {
          status: sub.status,
          planName: plan?.name || 'Unknown',
          planSlug: plan?.slug,
          priceMonthly: plan?.price_monthly,
          currentPeriodEnd: sub.current_period_end,
          trialEndsAt: sub.trial_ends_at,
        } : null,
        features: featureMap[t.id] || null,
      }
    })

    // Filter by subscription status if requested
    let filtered = enriched
    if (status) {
      filtered = enriched.filter(t => {
        if (status === 'no_subscription') return !t.subscription
        return t.subscription?.status === status
      })
    }

    return NextResponse.json({ success: true, data: filtered, count: filtered.length })
  } catch (error: any) {
    console.error('Super admin tenants error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
