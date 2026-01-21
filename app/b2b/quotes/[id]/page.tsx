'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, FileText, Download, Send, Calendar, Users, 
  Building2, Loader2, Globe, Mail, Phone, User, Clock, CheckCircle2,
  XCircle, TrendingUp
} from 'lucide-react'

// ============================================
// B2B QUOTE DETAIL PAGE
// File: app/b2b/quotes/[id]/page.tsx
// ============================================

interface Quote {
  id: string
  quote_number: string
  variation_id: string
  partner_id: string | null
  client_name: string | null
  client_email: string | null
  client_phone: string | null
  client_nationality: string | null
  travel_date: string | null
  num_adults: number
  num_children: number
  tour_leader_included: boolean
  tour_leader_cost: number | null
  single_supplement: number | null
  is_eur_passport: boolean
  season: string | null
  services_snapshot: any[]
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  currency: string
  status: string
  valid_until: string
  notes: string | null
  created_at: string
  tour_variations: {
    variation_name: string
    variation_code: string
    tier: string
    inclusions: string[]
    exclusions: string[]
    tour_templates: {
      template_name: string
      template_code: string
      duration_days: number
      duration_nights: number
      short_description: string
    }
  } | null
  b2b_partners: {
    company_name: string
    partner_code: string
    contact_name: string | null
    email: string | null
  } | null
}

export default function QuoteDetailPage() {
  const params = useParams()
  const quoteId = params?.id as string

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (quoteId) fetchQuote()
  }, [quoteId])

  const fetchQuote = async () => {
    try {
      const res = await fetch(`/api/b2b/quotes/${quoteId}`)
      const data = await res.json()
      if (data.success) {
        setQuote(data.data)
      } else {
        setError(data.error || 'Quote not found')
      }
    } catch (err) {
      setError('Failed to load quote')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (newStatus: string) => {
    if (!quote) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/b2b/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      const data = await res.json()
      if (data.success) {
        setQuote({ ...quote, status: newStatus })
      }
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setUpdating(false)
    }
  }

  const formatDate = (dateStr: string, format: 'short' | 'long' = 'short') => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    if (format === 'long') {
      return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
      sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send },
      accepted: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
    }
    const style = styles[status] || styles.draft
    const Icon = style.icon
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${style.bg} ${style.text}`}>
        <Icon className="w-4 h-4" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      budget: 'bg-emerald-100 text-emerald-700',
      standard: 'bg-blue-100 text-blue-700',
      luxury: 'bg-amber-100 text-amber-700',
    }
    return styles[tier] || 'bg-gray-100 text-gray-700'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#647C47]" />
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Link href="/b2b/quotes" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" />Back to Quotes
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800 font-medium">Quote not found</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const template = quote.tour_variations?.tour_templates
  const variation = quote.tour_variations
  const partner = quote.b2b_partners
  const services = quote.services_snapshot || []

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/b2b/quotes" className="p-2 hover:bg-gray-200 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
              <FileText className="w-5 h-5 text-[#647C47]" />
              {quote.quote_number}
              {getStatusBadge(quote.status)}
            </h1>
            <p className="text-sm text-gray-500">Created {formatDate(quote.created_at, 'long')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/b2b/quotes/${quote.id}/pdf`}
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            <Download className="w-4 h-4" />Download PDF
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tour Info */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{template?.template_name || 'Tour Package'}</h2>
                <p className="text-sm text-gray-500">{variation?.variation_name}</p>
              </div>
              {variation?.tier && (
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTierBadge(variation.tier)}`}>
                  {variation.tier.charAt(0).toUpperCase() + variation.tier.slice(1)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Duration</p>
                <p className="text-sm font-semibold">{template?.duration_days || '-'}D / {template?.duration_nights || '-'}N</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Travelers</p>
                <p className="text-sm font-semibold">{quote.num_adults} pax{quote.tour_leader_included && <span className="text-blue-600"> (+1 TL)</span>}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Travel Date</p>
                <p className="text-sm font-semibold">{quote.travel_date ? formatDate(quote.travel_date) : 'TBD'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Season</p>
                <p className="text-sm font-semibold">{quote.season ? quote.season.charAt(0).toUpperCase() + quote.season.slice(1) : '-'}</p>
              </div>
            </div>
          </div>

          {/* Services Table */}
          {services.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-base font-semibold mb-4">Services Included</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Service</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Qty</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Unit</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {services.map((service: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{service.service_name || 'Service'}</td>
                      <td className="px-4 py-2 text-right">{service.quantity || 1}</td>
                      <td className="px-4 py-2 text-right">€{(service.unit_cost || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium">€{(service.line_total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes */}
          {quote.notes && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-base font-semibold mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{quote.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pricing */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#647C47]" />Pricing
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>€{quote.total_cost?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Margin ({quote.margin_percent}%)</span>
                <span className="text-green-600">€{quote.margin_amount?.toFixed(2)}</span>
              </div>
              {quote.tour_leader_included && quote.tour_leader_cost && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tour Leader Cost</span>
                  <span className="text-blue-600">€{quote.tour_leader_cost.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-3 border-t">
                <div className="flex justify-between">
                  <span className="font-medium">Selling Price</span>
                  <span className="text-xl font-bold text-[#647C47]">€{quote.selling_price?.toFixed(2)}</span>
                </div>
                <p className="text-xs text-gray-500 text-right mt-1">€{quote.price_per_person?.toFixed(2)} per person</p>
              </div>
              {quote.single_supplement && quote.single_supplement > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-800">Single Supplement</span>
                    <span className="font-medium text-amber-700">€{quote.single_supplement.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Client / Partner */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4">Client Details</h3>
            {quote.client_name ? (
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" />{quote.client_name}</p>
                {quote.client_email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" />{quote.client_email}</p>}
                {quote.client_phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" />{quote.client_phone}</p>}
                {quote.client_nationality && <p className="flex items-center gap-2"><Globe className="w-4 h-4 text-gray-400" />{quote.client_nationality}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No client details</p>
            )}

            {partner && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-500 mb-2">Partner</p>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  {partner.company_name}
                </p>
                <p className="text-xs text-gray-500 ml-6">{partner.partner_code}</p>
              </div>
            )}
          </div>

          {/* Status Actions */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4">Update Status</h3>
            <div className="grid grid-cols-2 gap-2">
              {['draft', 'sent', 'accepted', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => updateStatus(status)}
                  disabled={updating || quote.status === status}
                  className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                    quote.status === status
                      ? 'bg-[#647C47] text-white'
                      : 'border hover:bg-gray-50 disabled:opacity-50'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Validity */}
          <div className="bg-gray-50 rounded-lg border p-4">
            <p className="text-xs text-gray-500">Valid Until</p>
            <p className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              {formatDate(quote.valid_until, 'long')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}