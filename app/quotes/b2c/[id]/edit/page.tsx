'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, Loader2, AlertCircle
} from 'lucide-react'
import RequireFeature from '@/components/RequireFeature'

interface B2CQuote {
  id: string
  quote_number: string
  num_travelers: number
  tier: string
  currency: string
  total_cost: number
  margin_percent: number
  selling_price: number
  price_per_person: number
  status: string
  valid_until: string | null
  internal_notes: string | null
  client_notes: string | null
  clients: {
    full_name: string
  } | null
  itineraries: {
    trip_name: string
  } | null
}

export default function EditB2CQuotePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()

  const [quote, setQuote] = useState<B2CQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [numTravelers, setNumTravelers] = useState(2)
  const [tier, setTier] = useState('standard')
  const [currency, setCurrency] = useState('EUR')
  const [totalCost, setTotalCost] = useState(0)
  const [marginPercent, setMarginPercent] = useState(25)
  const [status, setStatus] = useState('draft')
  const [validUntil, setValidUntil] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [clientNotes, setClientNotes] = useState('')

  // Calculated values
  const [sellingPrice, setSellingPrice] = useState(0)
  const [pricePerPerson, setPricePerPerson] = useState(0)

  useEffect(() => {
    fetchQuote()
  }, [params.id])

  useEffect(() => {
    // Recalculate selling price and price per person when relevant fields change
    const calculated = totalCost * (1 + marginPercent / 100)
    setSellingPrice(calculated)
    setPricePerPerson(calculated / numTravelers)
  }, [totalCost, marginPercent, numTravelers])

  const fetchQuote = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('b2c_quotes')
        .select(`
          *,
          clients (
            full_name
          ),
          itineraries (
            trip_name
          )
        `)
        .eq('id', params.id)
        .single()

      if (error) throw error

      setQuote(data)

      // Populate form
      setNumTravelers(data.num_travelers)
      setTier(data.tier)
      setCurrency(data.currency)
      setTotalCost(data.total_cost)
      setMarginPercent(data.margin_percent)
      setStatus(data.status)
      setValidUntil(data.valid_until || '')
      setInternalNotes(data.internal_notes || '')
      setClientNotes(data.client_notes || '')

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!quote) return

    try {
      setSaving(true)
      setError(null)

      const response = await fetch(`/api/quotes/b2c/${quote.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          num_travelers: numTravelers,
          tier,
          currency,
          total_cost: totalCost,
          margin_percent: marginPercent,
          status,
          valid_until: validUntil || null,
          internal_notes: internalNotes,
          client_notes: clientNotes,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update quote')
      }

      // Redirect to detail page
      router.push(`/quotes/b2c/${quote.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
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

  if (error && !quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-red-800 text-center mb-2">Error Loading Quote</h3>
          <p className="text-sm text-red-600 text-center mb-4">{error}</p>
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

  if (!quote) return null

  return (
    <RequireFeature feature="b2c">
      <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={`/quotes/b2c/${quote.id}`}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back to Quote</span>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Edit Quote {quote.quote_number}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {quote.clients?.full_name} • {quote.itineraries?.trip_name}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Error updating quote</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Configuration */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Configuration</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Travelers
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={numTravelers}
                  onChange={(e) => setNumTravelers(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Service Tier
                </label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="budget">Budget</option>
                  <option value="standard">Standard</option>
                  <option value="deluxe">Deluxe</option>
                  <option value="luxury">Luxury</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="EGP">EGP (E£)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Pricing</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Cost
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalCost}
                  onChange={(e) => setTotalCost(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Base cost before margin</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Margin (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Profit margin percentage</p>
              </div>
            </div>

            {/* Calculated Values */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-blue-600 uppercase tracking-wide mb-1">Selling Price</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {currency} {sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-600 uppercase tracking-wide mb-1">Price Per Person</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {currency} {pricePerPerson.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <p className="text-xs text-blue-600 mt-3">
                These values are calculated automatically based on cost and margin
              </p>
            </div>
          </div>

          {/* Status & Validity */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Status & Validity</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="viewed">Viewed</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valid Until
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Notes</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Internal Notes
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Notes for internal use only..."
                />
                <p className="text-xs text-gray-500 mt-1">Not visible to client</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client-Facing Notes
                </label>
                <textarea
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Notes that will be visible to the client..."
                />
                <p className="text-xs text-gray-500 mt-1">Will appear in quote and emails</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href={`/quotes/b2c/${quote.id}`}
              className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
    </RequireFeature>
  )
}
