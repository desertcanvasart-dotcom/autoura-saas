'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, Search, Download, Trash2, Eye,
  Building2, Loader2, Plus, RefreshCw,
  CheckCircle2, Clock, XCircle, Send
} from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import { useModal } from '@/app/contexts/ModalContext'

// ============================================
// B2B QUOTES LIST PAGE
// File: app/b2b/quotes/page.tsx
// ============================================

interface Quote {
  id: string
  quote_number: string
  client_name: string | null
  travel_date: string | null
  num_adults: number
  tour_leader_included: boolean
  selling_price: number
  price_per_person: number
  status: string
  created_at: string
  tour_variations: {
    variation_name: string
    tour_templates: {
      template_name: string
    }
  } | null
  b2b_partners: {
    company_name: string
    partner_code: string
  } | null
}

export default function QuotesListPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { tenant, loading: tenantLoading, isManager } = useTenant()
  const modal = useModal()

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  // Authentication check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user && tenant) {
      fetchQuotes()
    }
  }, [statusFilter, user, tenant])

  const fetchQuotes = async () => {
    setLoading(true)
    try {
      let url = '/api/b2b/quotes?limit=100'
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`
      }
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setQuotes(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch quotes:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, quoteNumber: string) => {
    if (!isManager) {
      await modal.alert('Permission Denied', 'You don\'t have permission to delete quotes')
      return
    }

    const confirmed = await modal.confirmDestructive(
      'Delete Quote',
      `Are you sure you want to delete quote ${quoteNumber}?`,
      { confirmText: 'Delete Quote', cancelText: 'Cancel' }
    )
    if (!confirmed) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/b2b/quotes/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setQuotes(quotes.filter(q => q.id !== id))
      } else {
        await modal.alert('Error', data.error || 'Failed to delete quote')
      }
    } catch (err) {
      console.error('Failed to delete quote:', err)
      await modal.alert('Error', 'An unexpected error occurred')
    } finally {
      setDeleting(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
      sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send },
      accepted: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
      expired: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
    }
    const style = styles[status] || styles.draft
    const Icon = style.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filteredQuotes = quotes.filter(quote => {
    const search = searchTerm.toLowerCase()
    return (
      quote.quote_number.toLowerCase().includes(search) ||
      quote.client_name?.toLowerCase().includes(search) ||
      quote.tour_variations?.tour_templates?.template_name.toLowerCase().includes(search) ||
      quote.b2b_partners?.company_name.toLowerCase().includes(search)
    )
  })

  const stats = {
    total: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    sent: quotes.filter(q => q.status === 'sent').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
  }

  // Show loading state while checking auth/tenant
  if (authLoading || tenantLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#647C47]" />
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
          <p className="text-gray-600 mb-4">You need manager permissions to view B2B quotes.</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35]"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Tenant Context */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
        <Building2 className="w-4 h-4" />
        <span>{tenant.company_name}</span>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">B2B Quotes</h1>
            <p className="text-sm text-gray-500">Manage saved quotations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchQuotes} className="p-2 border rounded-lg hover:bg-gray-50" title="Refresh">
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
          <Link href="/tours/manager" className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium text-sm">
            <Plus className="w-4 h-4" />New Quote
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">Draft</p>
          <p className="text-2xl font-bold text-gray-600">{stats.draft}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">Sent</p>
          <p className="text-2xl font-bold text-blue-600">{stats.sent}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">Accepted</p>
          <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search quotes..." className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 text-sm border rounded-lg bg-white">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#647C47]" />
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No quotes found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Quote</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Tour</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Client / Partner</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Pax</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Travel Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Price</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredQuotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-mono text-sm font-medium text-[#647C47]">{quote.quote_number}</p>
                    <p className="text-xs text-gray-500">{formatDate(quote.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{quote.tour_variations?.tour_templates?.template_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{quote.tour_variations?.variation_name || ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    {quote.client_name ? <p className="text-sm">{quote.client_name}</p> : <p className="text-sm text-gray-400 italic">No client</p>}
                    {quote.b2b_partners && <p className="text-xs text-blue-600 flex items-center gap-1"><Building2 className="w-3 h-3" />{quote.b2b_partners.company_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">{quote.num_adults}{quote.tour_leader_included && <span className="text-xs text-blue-500 ml-1">(+1)</span>}</td>
                  <td className="px-4 py-3 text-center text-sm">{quote.travel_date ? formatDate(quote.travel_date) : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-bold text-[#647C47]">€{quote.selling_price?.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">€{quote.price_per_person?.toFixed(2)}/pp</p>
                  </td>
                  <td className="px-4 py-3 text-center">{getStatusBadge(quote.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/b2b/quotes/${quote.id}`} className="p-1.5 hover:bg-gray-100 rounded" title="View"><Eye className="w-4 h-4 text-gray-500" /></Link>
                      <a href={`/api/b2b/quotes/${quote.id}/pdf`} target="_blank" className="p-1.5 hover:bg-red-50 rounded" title="PDF"><Download className="w-4 h-4 text-red-500" /></a>
                      <button onClick={() => handleDelete(quote.id, quote.quote_number)} disabled={deleting === quote.id} className="p-1.5 hover:bg-red-50 rounded disabled:opacity-50" title="Delete">
                        {deleting === quote.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}