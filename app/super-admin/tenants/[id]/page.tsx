'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserCog, Shield, ToggleLeft, ToggleRight, Users, Activity, Save, Loader2 } from 'lucide-react'

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/super-admin/tenants/${id}`)
        const json = await res.json()
        if (json.success) setData(json.data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleToggleFeature = async (field: string, currentValue: boolean) => {
    setSaving(field)
    try {
      await fetch(`/api/super-admin/tenants/${id}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: !currentValue }),
      })
      setData((prev: any) => ({
        ...prev,
        features: { ...prev.features, [field]: !currentValue },
      }))
    } catch (err) {
      console.error(err)
    } finally {
      setSaving('')
    }
  }

  const handleImpersonate = async () => {
    try {
      const res = await fetch(`/api/super-admin/tenants/${id}/impersonate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) router.push(json.redirectUrl)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm('Deactivate this tenant? All members will be suspended.')) return
    try {
      await fetch(`/api/super-admin/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deactivate: true }),
      })
      // Reload
      const res = await fetch(`/api/super-admin/tenants/${id}`)
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  if (!data) {
    return <div className="p-6 text-gray-400">Tenant not found</div>
  }

  const { tenant, members, features, subscription, recentActivity, usage } = data

  const featureToggles = [
    { key: 'b2c_enabled', label: 'B2C Quotes' },
    { key: 'b2b_enabled', label: 'B2B Quotes' },
    { key: 'whatsapp_integration', label: 'WhatsApp' },
    { key: 'email_integration', label: 'Email' },
    { key: 'pdf_generation', label: 'PDF Generation' },
    { key: 'analytics_enabled', label: 'Analytics' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/super-admin/tenants" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{tenant.company_name || 'Unnamed Tenant'}</h1>
            <p className="text-sm text-gray-400">{tenant.contact_email} | {tenant.business_type?.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImpersonate}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <UserCog className="w-4 h-4" />
            Impersonate
          </button>
          <button
            onClick={handleDeactivate}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium rounded-lg border border-red-600/30 transition-colors"
          >
            Deactivate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left Column: Info + Features */}
        <div className="col-span-2 space-y-4">
          {/* Subscription */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" /> Subscription
            </h2>
            {subscription ? (
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-xs text-gray-400 block">Plan</span>
                  <span className="text-white font-medium">{subscription.plan?.name || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">Status</span>
                  <span className={`font-medium ${
                    subscription.status === 'active' ? 'text-green-400' :
                    subscription.status === 'trialing' ? 'text-blue-400' :
                    subscription.status === 'past_due' ? 'text-red-400' :
                    'text-gray-400'
                  }`}>{subscription.status}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">Billing</span>
                  <span className="text-white">{subscription.billing_cycle || '-'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">Period End</span>
                  <span className="text-white">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : '-'}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No active subscription</p>
            )}
          </div>

          {/* Feature Flags */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Feature Flags</h2>
            <div className="grid grid-cols-3 gap-3">
              {featureToggles.map(ft => {
                const enabled = features?.[ft.key] ?? false
                return (
                  <button
                    key={ft.key}
                    onClick={() => handleToggleFeature(ft.key, enabled)}
                    disabled={saving === ft.key}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      enabled
                        ? 'bg-green-900/20 border-green-700/50 text-green-400'
                        : 'bg-gray-800 border-gray-700 text-gray-500'
                    }`}
                  >
                    <span>{ft.label}</span>
                    {saving === ft.key ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : enabled ? (
                      <ToggleRight className="w-5 h-5" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>
                )
              })}
            </div>
            {features && (
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-700">
                <div className="text-sm">
                  <span className="text-xs text-gray-400 block">Max Users</span>
                  <span className="text-white">{features.max_users || 'Unlimited'}</span>
                </div>
                <div className="text-sm">
                  <span className="text-xs text-gray-400 block">Max Quotes/Month</span>
                  <span className="text-white">{features.max_quotes_per_month || 'Unlimited'}</span>
                </div>
                <div className="text-sm">
                  <span className="text-xs text-gray-400 block">Max Partners</span>
                  <span className="text-white">{features.max_partners || 'Unlimited'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Members */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" /> Members ({members.length})
            </h2>
            <div className="space-y-2">
              {members.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-gray-900/50 rounded-lg">
                  <div>
                    <span className="text-sm text-white">{m.user?.full_name || m.user?.email || 'Unknown'}</span>
                    <span className="text-xs text-gray-500 ml-2">{m.user?.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      m.role === 'owner' ? 'bg-amber-900/50 text-amber-400' :
                      m.role === 'admin' ? 'bg-red-900/50 text-red-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>{m.role}</span>
                    <span className={`text-xs ${m.status === 'active' ? 'text-green-400' : 'text-gray-500'}`}>{m.status}</span>
                  </div>
                </div>
              ))}
              {members.length === 0 && <p className="text-gray-500 text-sm">No members</p>}
            </div>
          </div>
        </div>

        {/* Right Column: Activity + Usage */}
        <div className="space-y-4">
          {/* Usage */}
          {usage && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">Usage (Current Period)</h2>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Quotes Created', value: usage.quotes_created },
                  { label: 'WhatsApp Messages', value: usage.whatsapp_messages_sent },
                  { label: 'Emails Fetched', value: usage.gmail_emails_fetched },
                  { label: 'PDFs Generated', value: usage.pdfs_generated },
                  { label: 'API Calls', value: usage.api_calls },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-gray-400">{item.label}</span>
                    <span className="text-white font-medium">{item.value || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Log */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400" /> Recent Activity
            </h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recentActivity.map((a: any) => (
                <div key={a.id} className="text-xs border-b border-gray-700/50 pb-2">
                  <span className="text-gray-400">{a.action_type}</span>
                  {a.resource_type && <span className="text-gray-500 ml-1">on {a.resource_type}</span>}
                  <span className="text-gray-600 block">{new Date(a.created_at).toLocaleString()}</span>
                </div>
              ))}
              {recentActivity.length === 0 && <p className="text-gray-500 text-sm">No activity recorded</p>}
            </div>
          </div>

          {/* Tenant Meta */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Tenant Info</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">ID</span>
                <span className="text-white font-mono text-xs">{tenant.id?.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Created</span>
                <span className="text-white">{new Date(tenant.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Currency</span>
                <span className="text-white">{tenant.currency || 'EUR'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Timezone</span>
                <span className="text-white">{tenant.timezone || 'UTC'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
