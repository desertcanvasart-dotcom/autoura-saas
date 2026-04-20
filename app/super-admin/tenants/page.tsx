'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, UserCog, Eye, Building2 } from 'lucide-react'

export default function TenantsListPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchTenants = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/super-admin/tenants?${params}`)
      const data = await res.json()
      if (data.success) setTenants(data.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    const timer = setTimeout(fetchTenants, 300)
    return () => clearTimeout(timer)
  }, [fetchTenants])

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/impersonate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        router.push(data.redirectUrl)
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">All Tenants</h1>
        <p className="text-gray-400 text-sm mt-1">{tenants.length} tenants on the platform</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by company name or email..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none cursor-pointer"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
          <option value="no_subscription">No Subscription</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Company</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Email</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Type</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Plan</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Users</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Created</th>
                <th className="text-right text-xs text-gray-400 font-medium px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-500" />
                      <Link href={`/super-admin/tenants/${t.id}`} className="text-sm font-medium text-white hover:text-blue-400">
                        {t.company_name || 'Unnamed'}
                      </Link>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-400">{t.contact_email || '-'}</td>
                  <td className="px-5 py-3 text-xs text-gray-400 capitalize">{t.business_type?.replace(/_/g, ' ') || '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.subscription?.status === 'active' ? 'bg-green-900/50 text-green-400' :
                      t.subscription?.status === 'trialing' ? 'bg-blue-900/50 text-blue-400' :
                      t.subscription?.status === 'past_due' ? 'bg-red-900/50 text-red-400' :
                      t.subscription?.status === 'canceled' ? 'bg-gray-700 text-gray-400' :
                      'bg-gray-700 text-gray-500'
                    }`}>
                      {t.subscription?.planName || 'None'}
                      {t.subscription?.status && t.subscription.status !== 'active' ? ` (${t.subscription.status})` : ''}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-400">{t.memberCount}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/super-admin/tenants/${t.id}`}
                        className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleImpersonate(t.id)}
                        className="p-1.5 text-gray-500 hover:text-amber-400 rounded-lg hover:bg-gray-700 transition-colors"
                        title="Impersonate tenant"
                      >
                        <UserCog className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-500">No tenants found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
