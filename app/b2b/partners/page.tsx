'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, Search, Edit, Trash2, X, Check, Building2,
  Mail, Phone, Globe, Percent, AlertCircle, CheckCircle2, XCircle
} from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import { useModal } from '@/app/contexts/ModalContext'
import RequireFeature from '@/components/RequireFeature'

// ============================================
// B2B PARTNERS PAGE
// File: app/b2b/partners/page.tsx
// ============================================

interface B2BPartner {
  id: string
  partner_code: string
  company_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  country: string | null
  currency: string
  default_margin_percent: number
  show_net_rates: boolean
  show_cost_breakdown: boolean
  pricing_model: string
  is_active: boolean
  credit_limit: number | null
  payment_terms: string | null
  notes: string | null
  created_at: string
}

interface Toast {
  id: string
  type: 'success' | 'error'
  message: string
}

const COUNTRIES = [
  'United States', 'United Kingdom', 'Germany', 'France', 'Italy', 'Spain',
  'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Australia', 'Canada',
  'Japan', 'China', 'UAE', 'Saudi Arabia', 'Egypt', 'Other'
]

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'AUD', 'CAD', 'JPY']

export default function B2BPartnersPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { tenant, loading: tenantLoading, isManager, canManagePartners } = useTenant()
  const modal = useModal()

  const [partners, setPartners] = useState<B2BPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingPartner, setEditingPartner] = useState<B2BPartner | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [formData, setFormData] = useState({
    partner_code: '', company_name: '', contact_name: '', email: '', phone: '',
    country: '', currency: 'EUR', default_margin_percent: 20, show_net_rates: false,
    show_cost_breakdown: false, pricing_model: 'margin', is_active: true,
    credit_limit: null as number | null, payment_terms: '', notes: ''
  })

  // Authentication check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user && tenant) {
      fetchPartners()
    }
  }, [showInactive, user, tenant])

  const fetchPartners = async () => {
    try {
      const res = await fetch(`/api/b2b/partners?active_only=${!showInactive}`)
      const data = await res.json()
      if (data.success) setPartners(data.data)
    } catch (err) {
      showToast('error', 'Failed to load partners')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const handleAddNew = () => {
    setEditingPartner(null)
    setFormData({
      partner_code: '', company_name: '', contact_name: '', email: '', phone: '',
      country: '', currency: 'EUR', default_margin_percent: 20, show_net_rates: false,
      show_cost_breakdown: false, pricing_model: 'margin', is_active: true,
      credit_limit: null, payment_terms: '', notes: ''
    })
    setShowModal(true)
  }

  const handleEdit = (partner: B2BPartner) => {
    setEditingPartner(partner)
    setFormData({
      partner_code: partner.partner_code, company_name: partner.company_name,
      contact_name: partner.contact_name || '', email: partner.email || '',
      phone: partner.phone || '', country: partner.country || '', currency: partner.currency,
      default_margin_percent: partner.default_margin_percent, show_net_rates: partner.show_net_rates,
      show_cost_breakdown: partner.show_cost_breakdown, pricing_model: partner.pricing_model,
      is_active: partner.is_active, credit_limit: partner.credit_limit,
      payment_terms: partner.payment_terms || '', notes: partner.notes || ''
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingPartner ? `/api/b2b/partners/${editingPartner.id}` : '/api/b2b/partners'
      const res = await fetch(url, {
        method: editingPartner ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', editingPartner ? 'Partner updated!' : 'Partner created!')
        setShowModal(false)
        fetchPartners()
      } else {
        showToast('error', data.error || 'Failed to save')
      }
    } catch (err) {
      showToast('error', 'Failed to save partner')
    }
  }

  const handleDelete = async (partner: B2BPartner) => {
    if (!canManagePartners) {
      showToast('error', 'You don\'t have permission to delete partners')
      return
    }

    const confirmed = await modal.confirmDestructive(
      'Delete Partner',
      `Are you sure you want to delete ${partner.company_name}? This will remove all associated data.`,
      { confirmText: 'Delete Partner', cancelText: 'Cancel' }
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/api/b2b/partners/${partner.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'Partner deleted!')
        fetchPartners()
      } else {
        showToast('error', data.error || 'Failed to delete')
      }
    } catch (err) {
      showToast('error', 'Failed to delete partner')
    }
  }

  const filteredPartners = partners.filter(p =>
    p.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.partner_code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Show loading state while checking auth/tenant
  if (authLoading || tenantLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#647C47] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Prevent flash of content before redirect
  if (!user || !tenant) {
    return null
  }

  // Authorization check
  if (!isManager) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don't have permission to manage B2B partners.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35]"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#647C47] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <RequireFeature feature="b2b">
      <div className="min-h-screen bg-gray-50 p-6">
        {/* Tenant Context */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
          <Building2 className="w-4 h-4" />
          <span>{tenant.company_name}</span>
        </div>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${toast.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
            <span className={`text-sm font-medium ${toast.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">B2B Partners</h1>
            <p className="text-sm text-gray-500">Manage partner accounts and pricing</p>
          </div>
        </div>
        <button onClick={handleAddNew} className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium text-sm">
          <Plus className="w-4 h-4" /> Add Partner
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">Total Partners</p>
          <p className="text-2xl font-bold">{partners.length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">Active</p>
          <p className="text-2xl font-bold text-green-600">{partners.filter(p => p.is_active).length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">Countries</p>
          <p className="text-2xl font-bold">{new Set(partners.map(p => p.country).filter(Boolean)).size}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">Avg Margin</p>
          <p className="text-2xl font-bold text-[#647C47]">
            {partners.length > 0 ? (partners.reduce((sum, p) => sum + p.default_margin_percent, 0) / partners.length).toFixed(1) : 0}%
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border p-4 mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search partners..." className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none" />
        </div>
        <button onClick={() => setShowInactive(!showInactive)} className={`px-4 py-2 text-sm rounded-lg font-medium ${showInactive ? 'bg-gray-100 border text-gray-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          {showInactive ? 'Show All' : 'Active Only'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Partner</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Contact</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Country</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Margin</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredPartners.map(partner => (
              <tr key={partner.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{partner.company_name}</p>
                  <p className="text-xs text-gray-500 font-mono">{partner.partner_code}</p>
                </td>
                <td className="px-4 py-3 text-sm">
                  {partner.contact_name && <p>{partner.contact_name}</p>}
                  {partner.email && <p className="text-xs text-gray-500">{partner.email}</p>}
                </td>
                <td className="px-4 py-3 text-center text-sm">{partner.country || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-1 bg-[#647C47]/10 text-[#647C47] rounded text-sm font-medium">{partner.default_margin_percent}%</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${partner.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {partner.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => handleEdit(partner)} className="p-1.5 hover:bg-[#647C47]/10 rounded"><Edit className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => handleDelete(partner)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-gray-500" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredPartners.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No partners found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingPartner ? 'Edit Partner' : 'Add New Partner'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Company Name *</label>
                  <input type="text" value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} required className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Partner Code</label>
                  <input type="text" value={formData.partner_code} onChange={(e) => setFormData({ ...formData, partner_code: e.target.value })} placeholder="Auto-generated" className="w-full px-3 py-2 text-sm border rounded-lg font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
                  <input type="text" value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} className="w-full px-3 py-2 text-sm border rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 text-sm border rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 text-sm border rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                  <select value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                    <option value="">Select...</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Default Margin (%)</label>
                  <input type="number" value={formData.default_margin_percent} onChange={(e) => setFormData({ ...formData, default_margin_percent: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 text-sm border rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="w-4 h-4 text-[#647C47] rounded" />
                    <span className="text-sm">Partner is active</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" /> {editingPartner ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </RequireFeature>
  )
}