'use client'

// Super-admin UI for concierge_brand_mappings — the routing table the
// concierge webhook uses to deliver AI-concierge briefs to a tenant by the
// payload's `brand` key. Backed by /api/super-admin/concierge-brands
// (GET list / POST upsert / DELETE by brand_key). Until this page existed the
// table was only editable via SQL.

import { useEffect, useState, useCallback } from 'react'
import { Waypoints, Trash2, Plus, Power } from 'lucide-react'

interface Mapping {
  id: string
  brand_key: string
  tenant_id: string
  active: boolean
  created_at: string
  updated_at: string
  tenants: { company_name: string | null } | null
}

interface TenantOption {
  id: string
  company_name: string | null
  contact_email: string | null
}

export default function ConciergeBrandsPage() {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newBrandKey, setNewBrandKey] = useState('')
  const [newTenantId, setNewTenantId] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mapRes, tenantRes] = await Promise.all([
        fetch('/api/super-admin/concierge-brands'),
        fetch('/api/super-admin/tenants'),
      ])
      const mapData = await mapRes.json()
      const tenantData = await tenantRes.json()
      if (mapData.success) setMappings(mapData.data)
      else setError(mapData.error || 'Failed to load mappings')
      if (tenantData.success) setTenants(tenantData.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const upsert = async (brand_key: string, tenant_id: string, active: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/super-admin/concierge-brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_key, tenant_id, active }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Save failed')
        return false
      }
      await fetchAll()
      return true
    } catch (err: any) {
      setError(err?.message || 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    if (!newBrandKey.trim() || !newTenantId) return
    const ok = await upsert(newBrandKey, newTenantId, true)
    if (ok) {
      setNewBrandKey('')
      setNewTenantId('')
    }
  }

  const handleDelete = async (brand_key: string) => {
    if (!confirm(`Delete the mapping for "${brand_key}"?\n\nBriefs arriving with this brand key will be REJECTED (422) until it is re-mapped.`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/super-admin/concierge-brands?brand_key=${encodeURIComponent(brand_key)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!data.success) setError(data.error || 'Delete failed')
      await fetchAll()
    } catch (err: any) {
      setError(err?.message || 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  const tenantLabel = (t: TenantOption) =>
    `${t.company_name || 'Unnamed'}${t.contact_email ? ` — ${t.contact_email}` : ''}`

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Concierge Brand Routing</h1>
        <p className="text-gray-400 text-sm mt-1">
          Maps an inbound brief&apos;s <code className="text-gray-300">brand</code> key to the tenant that receives it.
          A brief with an unmapped brand is rejected (422); the receiving tenant must also have the AI Concierge
          feature enabled (tenant detail page).
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-800 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Add / upsert */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={newBrandKey}
          onChange={e => setNewBrandKey(e.target.value)}
          placeholder="brand key (e.g. travel2egypt) — stored lowercase"
          className="flex-1 max-w-xs px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none font-mono"
        />
        <select
          value={newTenantId}
          onChange={e => setNewTenantId(e.target.value)}
          className="flex-1 max-w-md bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none cursor-pointer"
        >
          <option value="">Select receiving tenant…</option>
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{tenantLabel(t)}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={saving || !newBrandKey.trim() || !newTenantId}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Map brand
        </button>
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
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Brand key</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Receiving tenant</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Status</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Updated</th>
                <th className="text-right text-xs text-gray-400 font-medium px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Waypoints className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-mono font-medium text-white">{m.brand_key}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-300">
                    {m.tenants?.company_name || <span className="text-gray-500 font-mono text-xs">{m.tenant_id}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.active ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {m.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{new Date(m.updated_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => upsert(m.brand_key, m.tenant_id, !m.active)}
                        disabled={saving}
                        className="p-1.5 text-gray-500 hover:text-amber-400 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
                        title={m.active ? 'Deactivate (briefs with this brand will be rejected)' : 'Activate'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(m.brand_key)}
                        disabled={saving}
                        className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
                        title="Delete mapping"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-gray-500">
                    No brand mappings yet — add one above to route concierge briefs to a tenant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
