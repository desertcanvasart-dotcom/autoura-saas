'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  FileText, Search, Send, Eye, Trash2, Pencil,
  Hotel, Car, Ship, MapPin, Users, CheckCircle,
  Clock, RotateCcw
} from 'lucide-react'

interface SupplierDocument {
  id: string
  document_type: string
  document_number: string
  supplier_name: string
  client_name: string
  num_adults: number
  num_children: number
  city: string
  service_date: string | null
  check_in: string | null
  check_out: string | null
  currency: string
  total_cost: number
  status: string
  created_at: string
  itinerary?: {
    id: string
    itinerary_code: string
  }
}

interface Stats {
  total: number
  draft: number
  sent: number
  confirmed: number
  completed: number
  by_type: Record<string, number>
}

const DOCUMENT_TYPES = [
  { value: 'hotel_voucher', label: 'Hotel Voucher', icon: Hotel, color: 'bg-blue-100 text-blue-700' },
  { value: 'service_order', label: 'Service Order', icon: FileText, color: 'bg-purple-100 text-purple-700' },
  { value: 'transport_voucher', label: 'Transport Voucher', icon: Car, color: 'bg-amber-100 text-amber-700' },
  { value: 'guide_assignment', label: 'Guide Assignment', icon: Users, color: 'bg-pink-100 text-pink-700' },
  { value: 'cruise_voucher', label: 'Cruise Voucher', icon: Ship, color: 'bg-cyan-100 text-cyan-700' }
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  { value: 'completed', label: 'Completed', color: 'bg-purple-100 text-purple-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-700' }
]

export default function SupplierDocumentsPage() {
  const [documents, setDocuments] = useState<SupplierDocument[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      fetchDocuments()
    }
  }, [mounted, typeFilter, statusFilter])

  const fetchDocuments = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.append('type', typeFilter)
      if (statusFilter) params.append('status', statusFilter)
      
      const response = await fetch(`/api/supplier-documents?${params}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      setDocuments(result.data || [])
      setStats(result.stats || null)
      
    } catch (err) {
      console.error('Error fetching documents:', err)
      setError(err instanceof Error ? err.message : 'Failed to load documents')
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatus = async (docId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/supplier-documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      
      if (response.ok) {
        fetchDocuments()
      }
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    
    try {
      const response = await fetch(`/api/supplier-documents/${docId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        fetchDocuments()
      }
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const getDocTypeConfig = (type: string) => {
    return DOCUMENT_TYPES.find(t => t.value === type) || DOCUMENT_TYPES[1]
  }

  const getStatusConfig = (status: string) => {
    return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]
  }

  const filteredDocuments = documents.filter(doc => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      doc.document_number?.toLowerCase().includes(search) ||
      doc.supplier_name?.toLowerCase().includes(search) ||
      doc.client_name?.toLowerCase().includes(search) ||
      doc.city?.toLowerCase().includes(search)
    )
  })

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Supplier Documents</h1>
              <p className="text-sm text-gray-500">Vouchers, service orders, and supplier communications</p>
            </div>
            <Link
              href="/documents"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              ← Back to All Documents
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button 
              onClick={fetchDocuments}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Documents</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-xl font-bold text-gray-900">{stats.draft}</p>
              <p className="text-xs text-gray-500">Draft</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Send className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xl font-bold text-blue-600">{stats.sent}</p>
              <p className="text-xs text-gray-500">Sent</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-xl font-bold text-green-600">{stats.confirmed}</p>
              <p className="text-xs text-gray-500">Confirmed</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-xl font-bold text-purple-600">{stats.completed}</p>
              <p className="text-xs text-gray-500">Completed</p>
            </div>
          </div>
        )}

        {/* Type Quick Filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !typeFilter ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All Types
          </button>
          {DOCUMENT_TYPES.map(type => {
            const Icon = type.icon
            return (
              <button
                key={type.value}
                onClick={() => setTypeFilter(type.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  typeFilter === type.value 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {type.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by document #, supplier, client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Documents List */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-sm text-gray-500">Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">No documents found</p>
              <p className="text-xs text-gray-500 mt-1">Generate documents from an itinerary to get started</p>
              <Link
                href="/itineraries"
                className="inline-block mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                Go to Itineraries
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Document</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Guest</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDocuments.map((doc) => {
                    const typeConfig = getDocTypeConfig(doc.document_type)
                    const statusConfig = getStatusConfig(doc.status)
                    const TypeIcon = typeConfig.icon
                    
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded ${typeConfig.color}`}>
                              <TypeIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{doc.document_number}</p>
                              <p className="text-xs text-gray-500">{typeConfig.label}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{doc.supplier_name}</p>
                          {doc.city && <p className="text-xs text-gray-500">{doc.city}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900">{doc.client_name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {/* View */}
                            <Link
                              href={`/documents/supplier/${doc.id}`}
                              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                              title="View"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                            
                            {/* Edit - available for all statuses EXCEPT cancelled */}
                            {doc.status !== 'cancelled' && (
                              <Link
                                href={`/documents/supplier/${doc.id}/edit`}
                                className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </Link>
                            )}
                            
                            {/* Mark as Sent - only for drafts */}
                            {doc.status === 'draft' && (
                              <button
                                onClick={() => handleUpdateStatus(doc.id, 'sent')}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"
                                title="Mark as Sent"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            
                            {/* Mark as Confirmed - only for sent */}
                            {doc.status === 'sent' && (
                              <button
                                onClick={() => handleUpdateStatus(doc.id, 'confirmed')}
                                className="p-1.5 text-green-500 hover:bg-green-50 rounded"
                                title="Mark as Confirmed"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            
                            {/* Mark as Completed - only for confirmed */}
                            {doc.status === 'confirmed' && (
                              <button
                                onClick={() => handleUpdateStatus(doc.id, 'completed')}
                                className="p-1.5 text-purple-500 hover:bg-purple-50 rounded"
                                title="Mark as Completed"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            
                            {/* Revert to Draft - for sent/confirmed/completed */}
                            {['sent', 'confirmed', 'completed'].includes(doc.status) && (
                              <button
                                onClick={() => handleUpdateStatus(doc.id, 'draft')}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Revert to Draft"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                            
                            {/* Delete */}
                            <button
                              onClick={() => handleDelete(doc.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}