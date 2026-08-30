'use client'

import { useState, useEffect, useCallback } from 'react'
import { todayLocal } from '@/lib/today'
import { 
  Plus, 
  Search, 
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Store,
  Building,
  Car,
  UtensilsCrossed,
  Ship,
  Users,
  Handshake,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  X,
  Check,
  Clock,
  AlertCircle,
  ChevronDown,
  Receipt,
  MapPin,
  Sparkles,
  Ticket,
  Heart
} from 'lucide-react'
import Link from 'next/link'
import { showToast } from '@/app/contexts/ToastContext'
import { useConfirmDialog } from '@/components/ConfirmDialog'

interface Commission {
  id: string
  itinerary_id: string | null
  supplier_id: string | null
  client_id: string | null
  commission_type: 'receivable' | 'payable'
  category: string
  source_name: string | null
  source_contact: string | null
  description: string | null
  base_amount: number
  commission_rate: number | null
  commission_amount: number
  currency: string
  status: string
  transaction_date: string
  due_date: string | null
  paid_date: string | null
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
  supplier?: { id: string; name: string; type: string } | null
  itinerary?: { id: string; itinerary_code: string; client_name: string } | null
  client?: { id: string; first_name: string; last_name: string; email: string } | null
}

interface Summary {
  total_receivable: number
  total_payable: number
  pending_receivable: number
  pending_payable: number
  received: number
  paid: number
  net_commission: number
  by_category: Record<string, { receivable: number; payable: number; count: number }>
}

interface Supplier {
  id: string
  name: string
  type: string
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
    hotel: { label: 'Hotel', icon: Building, color: 'text-blue-600 bg-blue-50' },
    shopping: { label: 'Shopping', icon: Store, color: 'text-pink-600 bg-pink-50' },
    restaurant: { label: 'Restaurant', icon: UtensilsCrossed, color: 'text-orange-600 bg-orange-50' },
    transport: { label: 'Transport', icon: Car, color: 'text-purple-600 bg-purple-50' },
    cruise: { label: 'Cruise', icon: Ship, color: 'text-cyan-600 bg-cyan-50' },
    attraction: { label: 'Attraction', icon: Receipt, color: 'text-amber-600 bg-amber-50' },
    optional_tour: { label: 'Optional Tour', icon: MapPin, color: 'text-teal-600 bg-teal-50' },
    activity: { label: 'Activity', icon: Sparkles, color: 'text-rose-600 bg-rose-50' },
    show: { label: 'Show/Event', icon: Ticket, color: 'text-violet-600 bg-violet-50' },
    spa: { label: 'Spa/Wellness', icon: Heart, color: 'text-red-600 bg-red-50' },
    agent_referral: { label: 'Agent Referral', icon: Users, color: 'text-indigo-600 bg-indigo-50' },
    partner: { label: 'Partner', icon: Handshake, color: 'text-emerald-600 bg-emerald-50' },
    other: { label: 'Other', icon: MoreHorizontal, color: 'text-gray-600 bg-gray-50' }
  }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'text-amber-700 bg-amber-50', icon: Clock },
  invoiced: { label: 'Invoiced', color: 'text-blue-700 bg-blue-50', icon: Receipt },
  received: { label: 'Received', color: 'text-green-700 bg-green-50', icon: Check },
  paid: { label: 'Paid', color: 'text-green-700 bg-green-50', icon: Check },
  cancelled: { label: 'Cancelled', color: 'text-gray-500 bg-gray-100', icon: X },
  disputed: { label: 'Disputed', color: 'text-red-700 bg-red-50', icon: AlertCircle }
}

interface FormData {
  commission_type: 'receivable' | 'payable'
  category: string
  supplier_id: string
  itinerary_id: string
  source_name: string
  source_contact: string
  description: string
  base_amount: number
  commission_rate: number
  commission_amount: number
  currency: string
  status: string
  transaction_date: string
  due_date: string
  notes: string
}

const initialFormData: FormData = {
  commission_type: 'receivable',
  category: 'hotel',
  supplier_id: '',
  itinerary_id: '',
  source_name: '',
  source_contact: '',
  description: '',
  base_amount: 0,
  commission_rate: 10,
  commission_amount: 0,
  currency: 'EUR',
  status: 'pending',
  transaction_date: todayLocal(),
  due_date: '',
  notes: ''
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const dialog = useConfirmDialog()

  const fetchCommissions = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.append('type', typeFilter)
      if (categoryFilter) params.append('category', categoryFilter)
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`/api/commissions?${params}`)
      if (response.ok) {
        const result = await response.json()
        setCommissions(result.data || [])
        setSummary(result.summary || null)
      }
    } catch (error) {
      console.error('Error fetching commissions:', error)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, categoryFilter, statusFilter])

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers')
      if (response.ok) {
        const result = await response.json()
        setSuppliers(result.data || result || [])
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  const fetchItineraries = async () => {
    try {
      const response = await fetch('/api/itineraries')
      if (response.ok) {
        const result = await response.json()
        setItineraries(result.data || result || [])
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error)
    }
  }

  useEffect(() => {
    fetchCommissions()
    fetchSuppliers()
    fetchItineraries()
  }, [fetchCommissions])

  // Calculate commission amount when base amount or rate changes
  useEffect(() => {
    if (formData.base_amount > 0 && formData.commission_rate > 0) {
      const calculated = (formData.base_amount * formData.commission_rate) / 100
      setFormData(prev => ({ ...prev, commission_amount: Math.round(calculated * 100) / 100 }))
    }
  }, [formData.base_amount, formData.commission_rate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = editingId ? `/api/commissions/${editingId}` : '/api/commissions'
      const method = editingId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setIsModalOpen(false)
        setEditingId(null)
        setFormData(initialFormData)
        fetchCommissions()
      } else {
        const error = await response.json()
        showToast('error', error.error || 'Failed to save commission')
      }
    } catch (error) {
      console.error('Error saving commission:', error)
      showToast('error', 'Failed to save commission')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (commission: Commission) => {
    setFormData({
      commission_type: commission.commission_type,
      category: commission.category,
      supplier_id: commission.supplier_id || '',
      itinerary_id: commission.itinerary_id || '',
      source_name: commission.source_name || '',
      source_contact: commission.source_contact || '',
      description: commission.description || '',
      base_amount: commission.base_amount,
      commission_rate: commission.commission_rate || 0,
      commission_amount: commission.commission_amount,
      currency: commission.currency,
      status: commission.status,
      transaction_date: commission.transaction_date,
      due_date: commission.due_date || '',
      notes: commission.notes || ''
    })
    setEditingId(commission.id)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!(await dialog.confirm({ message: 'Are you sure you want to delete this commission record?', variant: 'danger', confirmText: 'Delete' }))) return

    try {
      const response = await fetch(`/api/commissions/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchCommissions()
      }
    } catch (error) {
      console.error('Error deleting commission:', error)
    }
  }

  const handleMarkAs = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/commissions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (response.ok) {
        fetchCommissions()
      }
    } catch (error) {
      console.error('Error updating commission:', error)
    }
  }

  const openAddModal = () => {
    setFormData(initialFormData)
    setEditingId(null)
    setIsModalOpen(true)
  }

  const filteredCommissions = commissions.filter(c => {
    const search = searchTerm.toLowerCase()
    return (
      c.source_name?.toLowerCase().includes(search) ||
      c.description?.toLowerCase().includes(search) ||
      c.supplier?.name?.toLowerCase().includes(search) ||
      c.itinerary?.itinerary_code?.toLowerCase().includes(search) ||
      c.itinerary?.client_name?.toLowerCase().includes(search)
    )
  })

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
    return `${symbols[currency] || currency}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <Handshake className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Commission Tracking</h1>
            <p className="text-sm text-gray-500">Track commissions from hotels, shops, and partners</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4f6238] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Commission
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-xs text-gray-500">Receivable</span>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(summary.total_receivable)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-xs text-gray-500">Payable</span>
            </div>
            <p className="text-xl font-bold text-red-600">{formatCurrency(summary.total_payable)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-gray-500">Pending In</span>
            </div>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(summary.pending_receivable)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-gray-500">Pending Out</span>
            </div>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(summary.pending_payable)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Check className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-gray-500">Received</span>
            </div>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(summary.received)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Check className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-gray-500">Paid Out</span>
            </div>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(summary.paid)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-gray-500">Net</span>
            </div>
            <p className={`text-xl font-bold ${summary.net_commission >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary.net_commission)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search commissions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white cursor-pointer"
          >
            <option value="">All Types</option>
            <option value="receivable">Receivable</option>
            <option value="payable">Payable</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white cursor-pointer"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="invoiced">Invoiced</option>
            <option value="received">Received</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Type</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Category</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Source / Supplier</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Itinerary</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Base Amount</th>
              <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Rate</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Commission</th>
              <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Date</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredCommissions.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <Handshake className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No commissions found</p>
                  <button
                    onClick={openAddModal}
                    className="mt-3 text-sm text-[#647C47] hover:underline font-medium"
                  >
                    Add your first commission
                  </button>
                </td>
              </tr>
            ) : (
              filteredCommissions.map((commission) => {
                const categoryConfig = CATEGORY_CONFIG[commission.category] || CATEGORY_CONFIG.other
                const statusConfig = STATUS_CONFIG[commission.status] || STATUS_CONFIG.pending
                const CategoryIcon = categoryConfig.icon
                const StatusIcon = statusConfig.icon

                return (
                  <tr key={commission.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        commission.commission_type === 'receivable' 
                          ? 'bg-green-50 text-green-700' 
                          : 'bg-red-50 text-red-700'
                      }`}>
                        {commission.commission_type === 'receivable' ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {commission.commission_type === 'receivable' ? 'In' : 'Out'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${categoryConfig.color}`}>
                        <CategoryIcon className="h-3 w-3" />
                        {categoryConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {commission.supplier?.name || commission.source_name || '-'}
                      </p>
                      {commission.source_contact && (
                        <p className="text-xs text-gray-500">{commission.source_contact}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {commission.itinerary ? (
                        <Link href={`/itineraries/${commission.itinerary.id}`} className="text-sm text-blue-600 hover:underline">
                          {commission.itinerary.itinerary_code}
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-600">
                        {commission.base_amount > 0 ? formatCurrency(commission.base_amount, commission.currency) : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-600">
                        {commission.commission_rate ? `${commission.commission_rate}%` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-semibold ${
                        commission.commission_type === 'receivable' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {commission.commission_type === 'payable' ? '-' : ''}
                        {formatCurrency(commission.commission_amount, commission.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {new Date(commission.transaction_date).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {commission.status === 'pending' && (
                          <button
                            onClick={() => handleMarkAs(commission.id, commission.commission_type === 'receivable' ? 'received' : 'paid')}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title={commission.commission_type === 'receivable' ? 'Mark as Received' : 'Mark as Paid'}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(commission)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(commission.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Commission' : 'Add Commission'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Commission Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, commission_type: 'receivable' }))}
                    className={`p-4 rounded-lg border-2 transition-all flex items-center gap-3 ${
                      formData.commission_type === 'receivable'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <TrendingUp className={`h-5 w-5 ${formData.commission_type === 'receivable' ? 'text-green-600' : 'text-gray-400'}`} />
                    <div className="text-left">
                      <p className={`text-sm font-medium ${formData.commission_type === 'receivable' ? 'text-green-700' : 'text-gray-700'}`}>
                        Receivable (Income)
                      </p>
                      <p className="text-xs text-gray-500">Commission you receive</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, commission_type: 'payable' }))}
                    className={`p-4 rounded-lg border-2 transition-all flex items-center gap-3 ${
                      formData.commission_type === 'payable'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <TrendingDown className={`h-5 w-5 ${formData.commission_type === 'payable' ? 'text-red-600' : 'text-gray-400'}`} />
                    <div className="text-left">
                      <p className={`text-sm font-medium ${formData.commission_type === 'payable' ? 'text-red-700' : 'text-gray-700'}`}>
                        Payable (Expense)
                      </p>
                      <p className="text-xs text-gray-500">Commission you pay out</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                    const Icon = config.icon
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, category: key }))}
                        className={`p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${
                          formData.category === key
                            ? 'border-[#647C47] bg-[#647C47]/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${formData.category === key ? 'text-[#647C47]' : 'text-gray-400'}`} />
                        <span className={`text-sm ${formData.category === key ? 'text-[#647C47] font-medium' : 'text-gray-600'}`}>
                          {config.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Source / Supplier */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Supplier (Optional)</label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_id: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Or Enter Source Name</label>
                  <input
                    type="text"
                    value={formData.source_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, source_name: e.target.value }))}
                    placeholder="e.g., Khan El Khalili Shop"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>

              {/* Itinerary Link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Link to Itinerary (Optional)</label>
                <select
                  value={formData.itinerary_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, itinerary_id: e.target.value }))}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                >
                  <option value="">No Itinerary Link</option>
                  {itineraries.map(it => (
                    <option key={it.id} value={it.id}>{it.itinerary_code} - {it.client_name}</option>
                  ))}
                </select>
              </div>

              {/* Financial Details */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Base Amount</label>
                  <input
                    type="number"
                    value={formData.base_amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, base_amount: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                  <p className="text-xs text-gray-500 mt-1">Sale/booking amount</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rate (%)</label>
                  <input
                    type="number"
                    value={formData.commission_rate}
                    onChange={(e) => setFormData(prev => ({ ...prev, commission_rate: parseFloat(e.target.value) || 0 }))}
                    placeholder="10"
                    step="0.5"
                    min="0"
                    max="100"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Commission Amount <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    value={formData.commission_amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, commission_amount: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    required
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>

              {/* Date and Status */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Date</label>
                  <input
                    type="date"
                    value={formData.transaction_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="invoiced">Invoiced</option>
                    <option value="received">Received</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="disputed">Disputed</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., 10% commission on guest purchases"
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Commission' : 'Add Commission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}