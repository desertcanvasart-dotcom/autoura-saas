import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'

export async function GET() {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!

    const [tenantsRes, membersRes, subsRes, plansRes, invoicesRes] = await Promise.all([
      admin.from('tenants').select('id, company_name, created_at'),
      admin.from('tenant_members').select('id, status, joined_at'),
      admin.from('tenant_subscriptions').select('tenant_id, status, plan_id, billing_cycle'),
      admin.from('subscription_plans').select('id, name, slug, price_monthly, price_yearly'),
      admin.from('billing_invoices').select('amount_paid, status, created_at').eq('status', 'paid'),
    ])

    const tenants = tenantsRes.data || []
    const members = membersRes.data || []
    const subs = subsRes.data || []
    const plans = plansRes.data || []
    const invoices = invoicesRes.data || []

    const planMap: Record<string, any> = {}
    for (const p of plans) planMap[p.id] = p

    // Calculate MRR
    let mrr = 0
    const revenueByPlan: Record<string, { name: string; count: number; mrr: number }> = {}
    for (const s of subs) {
      if (s.status === 'active' || s.status === 'trialing') {
        const plan = planMap[s.plan_id]
        if (plan) {
          const monthly = s.billing_cycle === 'yearly' ? (plan.price_yearly || 0) / 12 : (plan.price_monthly || 0)
          mrr += monthly
          if (!revenueByPlan[plan.slug]) {
            revenueByPlan[plan.slug] = { name: plan.name, count: 0, mrr: 0 }
          }
          revenueByPlan[plan.slug].count++
          revenueByPlan[plan.slug].mrr += monthly
        }
      }
    }

    // Growth stats
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
    const newTenantsThisMonth = tenants.filter(t => new Date(t.created_at) >= thirtyDaysAgo).length
    const activeMembers = members.filter(m => m.status === 'active').length
    const activeSubs = subs.filter(s => s.status === 'active' || s.status === 'trialing').length
    const canceledSubs = subs.filter(s => s.status === 'canceled').length

    // Total revenue
    const totalRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.amount_paid) || 0), 0)

    return NextResponse.json({
      success: true,
      data: {
        totalTenants: tenants.length,
        totalUsers: activeMembers,
        activeSubscriptions: activeSubs,
        canceledSubscriptions: canceledSubs,
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(mrr * 12 * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        newTenantsThisMonth,
        churnRate: subs.length > 0 ? Math.round((canceledSubs / subs.length) * 100) : 0,
        revenueByPlan: Object.values(revenueByPlan),
        tenantGrowth: tenants.map(t => ({ date: t.created_at?.split('T')[0], name: t.company_name })),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
