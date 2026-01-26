'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PricingTable from '@/components/quotes/PricingTable'
import StatusManager from '@/components/quotes/StatusManager'
import {
  FileText, Building2, Mail, Phone, Calendar, DollarSign,
  ArrowLeft, Edit, Download, Send, Clock, AlertCircle, Loader2,
  MapPin, Users, CheckCircle, XCircle, Eye, Globe, MessageCircle
} from 'lucide-react'

interface B2BQuote {
  id: string
  quote_number: string
  status: string
  tier: string
  tour_leader_included: boolean
  currency: string
  ppd_accommodation: number
  ppd_cruise: number
  single_supplement: number
  fixed_transport: number
  fixed_guide: number
  fixed_other: number
  pp_entrance_fees: number
  pp_meals: number
  pp_tips: number
  pp_domestic_flights: number
  pricing_table: Record<string, { pp: number; total: number }>
  tour_leader_cost: number
  valid_from: string | null
  valid_until: string | null
  season: string | null
  internal_notes: string | null
  terms_and_conditions: string | null
  pdf_url: string | null
  created_at: string
  b2b_partners: {
    id: string
    company_name: string
    partner_code: string
    contact_name: string
    email: string
    phone: string
    country: string
  } | null
  itineraries: {
    id: string
    itinerary_code: string
    trip_name: string
    start_date: string
    end_date: string
    total_days: number
  } | null
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; icon: any }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: Clock },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: Send },
  accepted: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: CheckCircle },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: XCircle },
  expired: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: AlertCircle }
}

export default function B2BQuoteDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [quote, setQuote] = useState<B2BQuote | null>(null)
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
        .from('b2b_quotes')
        .select(`
          *,
          b2b_partners (
            id,
            company_name,
            partner_code,
            contact_name,
            email,
            phone,
            country
          ),
          itineraries (
            id,
            itinerary_code,
            trip_name,
            start_date,
            end_date,
            total_days
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

      const response = await fetch(`/api/quotes/b2b/${quote.id}/generate-pdf`)

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `b2b-rate-sheet-${quote.quote_number}.pdf`
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
      if (!quote || !quote.b2b_partners?.email) {
        alert('Cannot send rate sheet: No partner email address found')
        return
      }

      const recipientName = quote.b2b_partners.contact_name || quote.b2b_partners.company_name
      const confirmed = confirm(
        `Send this rate sheet to ${recipientName} via email at ${quote.b2b_partners.email}?`
      )

      if (!confirmed) return

      try {
        setSending(true)

        const response = await fetch(`/api/quotes/b2b/${quote.id}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send rate sheet')
        }

        alert(`Rate sheet sent successfully via email to ${data.email}!`)

        // Refresh quote data to update status
        await fetchQuote()
      } catch (err: any) {
        alert(`Error sending rate sheet: ${err.message}`)
      } finally {
        setSending(false)
      }
    } else {
      // WhatsApp
      if (!quote || !quote.b2b_partners?.phone) {
        alert('Cannot send rate sheet: No partner phone number found')
        return
      }

      const recipientName = quote.b2b_partners.contact_name || quote.b2b_partners.company_name
      const confirmed = confirm(
        `Send this rate sheet to ${recipientName} via WhatsApp at ${quote.b2b_partners.phone}?`
      )

      if (!confirmed) return

      try {
        setSending(true)

        const response = await fetch(`/api/quotes/b2b/${quote.id}/send-whatsapp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send rate sheet')
        }

        alert(`Rate sheet sent successfully via WhatsApp to ${data.phone}!${data.warning ? '\n\nNote: ' + data.warning : ''}`)

        // Refresh quote data to update status
        await fetchQuote()
      } catch (err: any) {
        alert(`Error sending rate sheet via WhatsApp: ${err.message}`)
      } finally {
        setSending(false)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-3" />
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
            href="/quotes/b2b"
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/quotes/b2b"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back to B2B Quotes</span>
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
              <Link
                href={`/quotes/b2b/${quote.id}/edit`}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit
              </Link>
              <button
                type="button"
                onClick={() => handleSendQuote('email')}
                disabled={sending || !quote.b2b_partners?.email}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                disabled={sending || !quote.b2b_partners?.phone}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!quote.b2b_partners?.phone ? 'No phone number available' : 'Send via WhatsApp'}
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
                  quoteType="b2b"
                  currentStatus={quote.status}
                  onStatusChange={fetchQuote}
                />
                {quote.tour_leader_included && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700">
                    Tour Leader +1
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Created {new Date(quote.created_at).toLocaleDateString()}
                {quote.season && ` • ${quote.season}`}
              </p>
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Service Tier</div>
              <div className="text-2xl font-bold text-gray-900">
                {quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Partner Information */}
        {quote.b2b_partners && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              Partner Information
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Company Name</label>
                <div className="text-sm font-medium text-gray-900 mt-1">{quote.b2b_partners.company_name}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Partner Code</label>
                <div className="text-sm font-medium text-gray-900 mt-1">{quote.b2b_partners.partner_code}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Country</label>
                <div className="text-sm font-medium text-gray-900 mt-1 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-400" />
                  {quote.b2b_partners.country}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Contact Person</label>
                <div className="text-sm font-medium text-gray-900 mt-1">{quote.b2b_partners.contact_name || 'Not specified'}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Email</label>
                <div className="text-sm font-medium text-gray-900 mt-1 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {quote.b2b_partners.email}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Phone</label>
                <div className="text-sm font-medium text-gray-900 mt-1 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {quote.b2b_partners.phone || 'Not provided'}
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
                <MapPin className="w-5 h-5 text-purple-600" />
                Linked Itinerary
              </h2>
              <Link
                href={`/itineraries/${quote.itineraries.id}`}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
              >
                View Full Itinerary
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-4">
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
            </div>
          </div>
        )}

        {/* Multi-Pax Pricing Table */}
        <PricingTable
          pricingTable={quote.pricing_table}
          currency={quote.currency}
          tourLeaderIncluded={quote.tour_leader_included}
        />

        {/* Cost Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-purple-600" />
            Cost Breakdown
          </h2>

          <div className="grid grid-cols-2 gap-6">
            {/* PPD Costs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Per Person Double (PPD)</h3>
              <div className="space-y-2">
                {quote.ppd_accommodation > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Accommodation</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.ppd_accommodation.toLocaleString()} / night
                    </span>
                  </div>
                )}
                {quote.ppd_cruise > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Cruise</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.ppd_cruise.toLocaleString()} / night
                    </span>
                  </div>
                )}
                {quote.single_supplement > 0 && (
                  <div className="flex items-center justify-between py-2 bg-amber-50 rounded px-2">
                    <span className="text-sm text-amber-700 font-medium">Single Supplement</span>
                    <span className="text-sm font-bold text-amber-700">
                      {quote.currency} {quote.single_supplement.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Fixed Costs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Fixed Costs (Per Trip)</h3>
              <div className="space-y-2">
                {quote.fixed_transport > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Transportation</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.fixed_transport.toLocaleString()}
                    </span>
                  </div>
                )}
                {quote.fixed_guide > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Guide</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.fixed_guide.toLocaleString()}
                    </span>
                  </div>
                )}
                {quote.fixed_other > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Other</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.fixed_other.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Per Person Costs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Per Person Costs</h3>
              <div className="space-y-2">
                {quote.pp_entrance_fees > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Entrance Fees</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.pp_entrance_fees.toLocaleString()}
                    </span>
                  </div>
                )}
                {quote.pp_meals > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Meals</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.pp_meals.toLocaleString()}
                    </span>
                  </div>
                )}
                {quote.pp_tips > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Tips</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.pp_tips.toLocaleString()}
                    </span>
                  </div>
                )}
                {quote.pp_domestic_flights > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Domestic Flights</span>
                    <span className="text-sm font-medium text-gray-900">
                      {quote.currency} {quote.pp_domestic_flights.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Tour Leader */}
            {quote.tour_leader_included && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Tour Leader</h3>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-amber-700 font-medium">Tour Leader Cost</span>
                    <span className="text-sm font-bold text-amber-700">
                      {quote.currency} {quote.tour_leader_cost.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-amber-600">
                    Cost distributed across paying passengers
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validity & Notes */}
        <div className="grid grid-cols-2 gap-6">
          {/* Validity */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Validity</h2>
            <div className="space-y-3 text-sm">
              {quote.valid_from && (
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Valid From</div>
                  <div className="text-gray-900 mt-1">{new Date(quote.valid_from).toLocaleDateString()}</div>
                </div>
              )}
              {quote.valid_until && (
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Valid Until</div>
                  <div className="text-gray-900 mt-1">{new Date(quote.valid_until).toLocaleDateString()}</div>
                </div>
              )}
              {quote.season && (
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Season</div>
                  <div className="text-gray-900 mt-1">{quote.season}</div>
                </div>
              )}
            </div>
          </div>

          {/* Internal Notes */}
          {quote.internal_notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Internal Notes</h2>
              <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                {quote.internal_notes}
              </div>
            </div>
          )}
        </div>

        {/* Terms & Conditions */}
        {quote.terms_and_conditions && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Terms & Conditions</h2>
            <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4 whitespace-pre-wrap">
              {quote.terms_and_conditions}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
