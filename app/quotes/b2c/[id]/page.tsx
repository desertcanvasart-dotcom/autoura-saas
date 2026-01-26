'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import StatusManager from '@/components/quotes/StatusManager'
import {
  FileText, User, Mail, Phone, Calendar, DollarSign, Percent,
  ArrowLeft, Edit, Download, Send, Eye, CheckCircle, XCircle,
  Clock, AlertCircle, Loader2, MapPin, Users, MessageCircle
} from 'lucide-react'
import RequireFeature from '@/components/RequireFeature'

interface B2CQuote {
  id: string
  quote_number: string
  status: string
  num_travelers: number
  tier: string
  total_cost: number
  margin_percent: number
  selling_price: number
  price_per_person: number
  currency: string
  cost_breakdown: {
    accommodation?: number
    transportation?: number
    entrance_fees?: number
    meals?: number
    guide?: number
    cruise?: number
    domestic_flights?: number
    tips?: number
    other?: number
  }
  created_at: string
  valid_until: string | null
  sent_at: string | null
  viewed_at: string | null
  internal_notes: string | null
  client_notes: string | null
  pdf_url: string | null
  clients: {
    id: string
    full_name: string
    email: string
    phone: string
    nationality: string
  } | null
  itineraries: {
    id: string
    itinerary_code: string
    trip_name: string
    start_date: string
    end_date: string
    total_days: number
    num_adults: number
    num_children: number
  } | null
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; icon: any }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: Clock },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: Send },
  viewed: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300', icon: Eye },
  accepted: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: CheckCircle },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: XCircle },
  expired: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: AlertCircle }
}

export default function B2CQuoteDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [quote, setQuote] = useState<B2CQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchQuote()
  }, [params.id])

  const fetchQuote = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('b2c_quotes')
        .select(`
          *,
          clients (
            id,
            full_name,
            email,
            phone,
            nationality
          ),
          itineraries (
            id,
            itinerary_code,
            trip_name,
            start_date,
            end_date,
            total_days,
            num_adults,
            num_children
          )
        `)
        .eq('id', params.id)
        .single()

      if (error) throw error
      setQuote(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!quote) return

    try {
      setPdfGenerating(true)

      const response = await fetch(`/api/quotes/b2c/${quote.id}/generate-pdf`)

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `quote-${quote.quote_number}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // Refresh quote data to get updated PDF URL
      await fetchQuote()
    } catch (err: any) {
      alert(`Error generating PDF: ${err.message}`)
    } finally {
      setPdfGenerating(false)
    }
  }

  const handleSendQuote = async (method: 'email' | 'whatsapp' = 'email') => {
    if (method === 'email') {
      if (!quote || !quote.clients?.email) {
        alert('Cannot send quote: No client email address found')
        return
      }

      const confirmed = confirm(
        `Send this quote to ${quote.clients.full_name} via email at ${quote.clients.email}?`
      )

      if (!confirmed) return

      try {
        setSending(true)

        const response = await fetch(`/api/quotes/b2c/${quote.id}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send quote')
        }

        alert(`Quote sent successfully via email to ${data.email}!`)

        // Refresh quote data to update status
        await fetchQuote()
      } catch (err: any) {
        alert(`Error sending quote: ${err.message}`)
      } finally {
        setSending(false)
      }
    } else {
      // WhatsApp
      if (!quote || !quote.clients?.phone) {
        alert('Cannot send quote: No client phone number found')
        return
      }

      const confirmed = confirm(
        `Send this quote to ${quote.clients.full_name} via WhatsApp at ${quote.clients.phone}?`
      )

      if (!confirmed) return

      try {
        setSending(true)

        const response = await fetch(`/api/quotes/b2c/${quote.id}/send-whatsapp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send quote')
        }

        alert(`Quote sent successfully via WhatsApp to ${data.phone}!${data.warning ? '\n\nNote: ' + data.warning : ''}`)

        // Refresh quote data to update status
        await fetchQuote()
      } catch (err: any) {
        alert(`Error sending quote via WhatsApp: ${err.message}`)
      } finally {
        setSending(false)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading quote...</p>
        </div>
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-red-800 text-center mb-2">Quote Not Found</h3>
          <p className="text-sm text-red-600 text-center mb-4">{error || 'This quote does not exist.'}</p>
          <Link
            href="/quotes/b2c"
            className="block w-full px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-center hover:bg-red-700"
          >
            Back to Quotes
          </Link>
        </div>
      </div>
    )
  }

  const statusConfig = STATUS_COLORS[quote.status] || STATUS_COLORS.draft
  const StatusIcon = statusConfig.icon

  const costBreakdownEntries = Object.entries(quote.cost_breakdown || {}).filter(([_, value]) => value > 0)

  return (
    <RequireFeature feature="b2c">
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <Link
              href="/quotes/b2c"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back to B2C Quotes</span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={pdfGenerating}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pdfGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download PDF
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleSendQuote('email')}
                disabled={sending || !quote.clients?.email}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Send Email
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleSendQuote('whatsapp')}
                disabled={sending || !quote.clients?.phone}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!quote.clients?.phone ? 'No phone number available' : 'Send via WhatsApp'}
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
                <StatusManager
                  quoteId={quote.id}
                  quoteType="b2c"
                  currentStatus={quote.status}
                  onStatusChange={fetchQuote}
                />
              </div>
              <p className="text-sm text-gray-500">
                Created {new Date(quote.created_at).toLocaleDateString()} at {new Date(quote.created_at).toLocaleTimeString()}
              </p>
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Total Selling Price</div>
              <div className="text-3xl font-bold text-gray-900">
                {quote.currency} {quote.selling_price.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {quote.currency} {quote.price_per_person.toLocaleString()} per person × {quote.num_travelers}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Main Info */}
          <div className="col-span-2 space-y-6">
            {/* Client Information */}
            {quote.clients && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Client Information
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Full Name</label>
                    <div className="text-sm font-medium text-gray-900 mt-1">{quote.clients.full_name}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Nationality</label>
                    <div className="text-sm font-medium text-gray-900 mt-1">{quote.clients.nationality || 'Not specified'}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Email</label>
                    <div className="text-sm font-medium text-gray-900 mt-1 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      {quote.clients.email || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Phone</label>
                    <div className="text-sm font-medium text-gray-900 mt-1 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      {quote.clients.phone || 'Not provided'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Itinerary Information */}
            {quote.itineraries && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    Linked Itinerary
                  </h2>
                  <Link
                    href={`/itineraries/${quote.itineraries.id}`}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    View Full Itinerary
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Itinerary Code</label>
                    <div className="text-sm font-medium text-gray-900 mt-1">{quote.itineraries.itinerary_code}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Trip Name</label>
                    <div className="text-sm font-medium text-gray-900 mt-1">{quote.itineraries.trip_name}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Start Date</label>
                    <div className="text-sm font-medium text-gray-900 mt-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {new Date(quote.itineraries.start_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Duration</label>
                    <div className="text-sm font-medium text-gray-900 mt-1">{quote.itineraries.total_days} days</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Travelers</label>
                    <div className="text-sm font-medium text-gray-900 mt-1 flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      {quote.itineraries.num_adults} adults
                      {quote.itineraries.num_children > 0 && `, ${quote.itineraries.num_children} children`}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Service Tier</label>
                    <div className="text-sm font-medium text-gray-900 mt-1">
                      {quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pricing Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-600" />
                Pricing Breakdown
              </h2>

              {/* Cost Breakdown */}
              <div className="space-y-2 mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Cost Components</div>
                {costBreakdownEntries.length > 0 ? (
                  costBreakdownEntries.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {quote.currency} {value.toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 italic">No cost breakdown available</p>
                )}
              </div>

              {/* Total Cost */}
              <div className="flex items-center justify-between py-3 border-t-2 border-gray-200">
                <span className="text-base font-bold text-gray-900">Total Cost</span>
                <span className="text-base font-bold text-gray-900">
                  {quote.currency} {quote.total_cost.toLocaleString()}
                </span>
              </div>

              {/* Margin */}
              <div className="flex items-center justify-between py-2 bg-blue-50 rounded-lg px-3 mt-2">
                <span className="text-sm text-blue-700 flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Margin ({quote.margin_percent}%)
                </span>
                <span className="text-sm font-bold text-blue-700">
                  {quote.currency} {(quote.selling_price - quote.total_cost).toLocaleString()}
                </span>
              </div>

              {/* Selling Price */}
              <div className="flex items-center justify-between py-3 border-t-2 border-gray-300 mt-3">
                <span className="text-lg font-bold text-gray-900">Selling Price</span>
                <span className="text-lg font-bold text-blue-600">
                  {quote.currency} {quote.selling_price.toLocaleString()}
                </span>
              </div>

              {/* Per Person */}
              <div className="flex items-center justify-between py-2 bg-gray-50 rounded-lg px-3 mt-2">
                <span className="text-sm text-gray-600">Price per Person ({quote.num_travelers} travelers)</span>
                <span className="text-sm font-bold text-gray-900">
                  {quote.currency} {quote.price_per_person.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Notes */}
            {(quote.internal_notes || quote.client_notes) && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Notes</h2>
                {quote.internal_notes && (
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Internal Notes</label>
                    <div className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-lg p-3">
                      {quote.internal_notes}
                    </div>
                  </div>
                )}
                {quote.client_notes && (
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Client-Facing Notes</label>
                    <div className="text-sm text-gray-700 mt-2 bg-blue-50 rounded-lg p-3">
                      {quote.client_notes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Quick Actions & Metadata */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleSendQuote('email')}
                  disabled={sending || !quote.clients?.email}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send via Email
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSendQuote('whatsapp')}
                  disabled={sending || !quote.clients?.phone}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!quote.clients?.phone ? 'No phone number available' : 'Send via WhatsApp'}
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4" />
                      Send via WhatsApp
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={pdfGenerating}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pdfGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Generate PDF
                    </>
                  )}
                </button>
                <Link
                  href={`/quotes/b2c/${quote.id}/edit`}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Quote
                </Link>
              </div>
            </div>

            {/* Metadata */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Quote Details</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Created</div>
                  <div className="text-gray-900 mt-1">
                    {new Date(quote.created_at).toLocaleDateString()}
                  </div>
                </div>
                {quote.valid_until && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Valid Until</div>
                    <div className="text-gray-900 mt-1">
                      {new Date(quote.valid_until).toLocaleDateString()}
                    </div>
                  </div>
                )}
                {quote.sent_at && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Sent At</div>
                    <div className="text-gray-900 mt-1">
                      {new Date(quote.sent_at).toLocaleDateString()}
                    </div>
                  </div>
                )}
                {quote.viewed_at && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Viewed At</div>
                    <div className="text-gray-900 mt-1">
                      {new Date(quote.viewed_at).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Currency & Travelers */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Configuration</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Currency</span>
                  <span className="font-medium text-gray-900">{quote.currency}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Travelers</span>
                  <span className="font-medium text-gray-900">{quote.num_travelers}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Tier</span>
                  <span className="font-medium text-gray-900">
                    {quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Margin</span>
                  <span className="font-medium text-gray-900">{quote.margin_percent}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </RequireFeature>
  )
}
