'use client'

import { useEffect, useState } from 'react'
import { Building2, Users, CreditCard, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'

export default function PlatformAnalyticsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/super-admin/analytics')
        const json = await res.json()
        if (json.success) setData(json.data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  if (!data) {
    return <div className="p-6 text-gray-400">Failed to load analytics</div>
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Platform Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">Revenue, growth, and usage metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'MRR', value: `$${data.mrr.toLocaleString()}`, icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-900/20' },
          { label: 'ARR', value: `$${data.arr.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
          { label: 'Total Revenue', value: `$${data.totalRevenue.toLocaleString()}`, icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-900/20' },
          { label: 'Churn Rate', value: `${data.churnRate}%`, icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-900/20' },
        ].map(card => (
          <div key={card.label} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</span>
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
            <span className="text-3xl font-bold text-white">{card.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Revenue by Plan */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Revenue by Plan</h2>
          {data.revenueByPlan.length > 0 ? (
            <div className="space-y-3">
              {data.revenueByPlan.map((plan: any) => (
                <div key={plan.name} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-white font-medium">{plan.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{plan.count} tenants</span>
                  </div>
                  <span className="text-sm font-bold text-green-400">${plan.mrr.toLocaleString()}/mo</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No subscription data</p>
          )}
        </div>

        {/* Platform Summary */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Platform Summary</h2>
          <div className="space-y-3">
            {[
              { label: 'Total Tenants', value: data.totalTenants, icon: Building2 },
              { label: 'Active Users', value: data.totalUsers, icon: Users },
              { label: 'Active Subscriptions', value: data.activeSubscriptions, icon: CreditCard },
              { label: 'Canceled Subscriptions', value: data.canceledSubscriptions, icon: TrendingDown },
              { label: 'New This Month', value: data.newTenantsThisMonth, icon: TrendingUp },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <item.icon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-400">{item.label}</span>
                </div>
                <span className="text-sm font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tenant Growth Timeline */}
        <div className="col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Tenant Growth</h2>
          <div className="flex flex-wrap gap-2">
            {data.tenantGrowth.slice(-20).map((t: any, i: number) => (
              <div key={i} className="bg-gray-900/50 rounded-lg px-3 py-1.5 text-xs">
                <span className="text-gray-500">{t.date}</span>
                <span className="text-white ml-2">{t.name}</span>
              </div>
            ))}
            {data.tenantGrowth.length === 0 && (
              <p className="text-gray-500 text-sm">No tenants yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
