'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Users, CreditCard, DollarSign, TrendingUp, ArrowRight } from 'lucide-react'

interface PlatformStats {
  totalTenants: number
  totalUsers: number
  activeSubscriptions: number
  mrr: number
  arr: number
  newTenantsThisMonth: number
  churnRate: number
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [analyticsRes, tenantsRes] = await Promise.all([
          fetch('/api/super-admin/analytics'),
          fetch('/api/super-admin/tenants'),
        ])
        const analyticsData = await analyticsRes.json()
        const tenantsData = await tenantsRes.json()
        if (analyticsData.success) setStats(analyticsData.data)
        if (tenantsData.success) setTenants(tenantsData.data.slice(0, 10))
      } catch (err) {
        console.error('Failed to load dashboard:', err)
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

  const statCards = [
    { label: 'Total Tenants', value: stats?.totalTenants || 0, icon: Building2, color: 'text-blue-400' },
    { label: 'Active Users', value: stats?.totalUsers || 0, icon: Users, color: 'text-green-400' },
    { label: 'Active Subscriptions', value: stats?.activeSubscriptions || 0, icon: CreditCard, color: 'text-purple-400' },
    { label: 'MRR', value: `$${(stats?.mrr || 0).toLocaleString()}`, icon: DollarSign, color: 'text-amber-400' },
    { label: 'ARR', value: `$${(stats?.arr || 0).toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-400' },
    { label: 'New This Month', value: stats?.newTenantsThisMonth || 0, icon: TrendingUp, color: 'text-cyan-400' },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Platform Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of your SaaS platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {statCards.map(card => (
          <div key={card.label} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-2xl font-bold text-white">{card.value}</span>
          </div>
        ))}
      </div>

      {/* Recent Tenants */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">Recent Tenants</h2>
          <Link href="/super-admin/tenants" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-xs text-gray-400 font-medium px-5 py-2">Company</th>
              <th className="text-left text-xs text-gray-400 font-medium px-5 py-2">Email</th>
              <th className="text-left text-xs text-gray-400 font-medium px-5 py-2">Plan</th>
              <th className="text-left text-xs text-gray-400 font-medium px-5 py-2">Users</th>
              <th className="text-left text-xs text-gray-400 font-medium px-5 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => (
              <tr key={t.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                <td className="px-5 py-2.5">
                  <Link href={`/super-admin/tenants/${t.id}`} className="text-sm text-white hover:text-blue-400">
                    {t.company_name || 'Unnamed'}
                  </Link>
                </td>
                <td className="px-5 py-2.5 text-sm text-gray-400">{t.contact_email || '-'}</td>
                <td className="px-5 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    t.subscription?.status === 'active' ? 'bg-green-900/50 text-green-400' :
                    t.subscription?.status === 'trialing' ? 'bg-blue-900/50 text-blue-400' :
                    t.subscription?.status === 'past_due' ? 'bg-red-900/50 text-red-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {t.subscription?.planName || 'No plan'}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-sm text-gray-400">{t.memberCount}</td>
                <td className="px-5 py-2.5 text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">No tenants found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
