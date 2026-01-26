'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, Loader2, AlertCircle, RefreshCw
} from 'lucide-react'

interface B2BQuote {
  id: string
  quote_number: string
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
  tour_leader_cost: number
  pricing_table: Record<string, { pp: number; total: number }>
  status: string
  valid_from: string | null
  valid_until: string | null
  season: string | null
  internal_notes: string | null
  terms_and_conditions: string | null
  b2b_partners: {
    company_name: string
  } | null
  itineraries: {
    trip_name: string
    total_days: number
  } | null
}

export default function EditB2BQuotePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()

  const [quote, setQuote] = useState<B2BQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [tier, setTier] = useState('standard')
  const [tourLeaderIncluded, setTourLeaderIncluded] = useState(false)
  const [currency, setCurrency] = useState('EUR')

  // PPD costs
  const [ppdAccommodation, setPpdAccommodation] = useState(0)
  const [ppdCruise, setPpdCruise] = useState(0)
  const [singleSupplement, setSingleSupplement] = useState(0)

  // Fixed costs
  const [fixedTransport, setFixedTransport] = useState(0)
  const [fixedGuide, setFixedGuide] = useState(0)
  const [fixedOther, setFixedOther] = useState(0)

  // Per-person costs
  const [ppEntranceFees, setPpEntranceFees] = useState(0)
  const [ppMeals, setPpMeals] = useState(0)
  const [ppTips, setPpTips] = useState(0)
  const [ppDomesticFlights, setPpDomesticFlights] = useState(0)

  // Tour leader
  const [tourLeaderCost, setTourLeaderCost] = useState(0)

  // Validity & metadata
  const [status, setStatus] = useState('draft')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [season, setSeason] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [termsAndConditions, setTermsAndConditions] = useState('')

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
            company_name
          ),
          itineraries (
            trip_name,
            total_days
          )
        `)
        .eq('id', params.id)
        .single()

      if (error) throw error

      setQuote(data)

      // Populate form
      setTier(data.tier)
      setTourLeaderIncluded(data.tour_leader_included)
      setCurrency(data.currency)

      setPpdAccommodation(data.ppd_accommodation)
      setPpdCruise(data.ppd_cruise)
      setSingleSupplement(data.single_supplement)

      setFixedTransport(data.fixed_transport)
      setFixedGuide(data.fixed_guide)
      setFixedOther(data.fixed_other)

      setPpEntranceFees(data.pp_entrance_fees)
      setPpMeals(data.pp_meals)
      setPpTips(data.pp_tips)
      setPpDomesticFlights(data.pp_domestic_flights)

      setTourLeaderCost(data.tour_leader_cost)

      setStatus(data.status)
      setValidFrom(data.valid_from || '')
      setValidUntil(data.valid_until || '')
      setSeason(data.season || '')
      setInternalNotes(data.internal_notes || '')
      setTermsAndConditions(data.terms_and_conditions || '')

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent, recalculate: boolean = false) => {
    e.preventDefault()

    if (!quote) return

    try {
      setSaving(true)
      setError(null)

      const response = await fetch(`/api/quotes/b2b/${quote.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tier,
          tour_leader_included: tourLeaderIncluded,
          currency,
          ppd_accommodation: ppdAccommodation,
          ppd_cruise: ppdCruise,
          single_supplement: singleSupplement,
          fixed_transport: fixedTransport,
          fixed_guide: fixedGuide,
          fixed_other: fixedOther,
          pp_entrance_fees: ppEntranceFees,
          pp_meals: ppMeals,
          pp_tips: ppTips,
          pp_domestic_flights: ppDomesticFlights,
          tour_leader_cost: tourLeaderCost,
          status,
          valid_from: validFrom || null,
          valid_until: validUntil || null,
          season: season || null,
          internal_notes: internalNotes,
          terms_and_conditions: termsAndConditions,
          recalculate,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update quote')
      }

      // If recalculate, refresh the page to show new pricing table
      if (recalculate) {
        await fetchQuote()
        alert('Pricing table recalculated successfully!')
      } else {
        // Redirect to detail page
        router.push(`/quotes/b2b/${quote.id}`)
      }
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
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-3" />
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
            href="/quotes/b2b"
            className="block w-full px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-center hover:bg-red-700"
          >
            Back to Quotes
          </Link>
        </div>
      </div>
    )
  }

  if (!quote) return null

  // Calculate sample pricing for 10 pax to show as preview
  const samplePax = 10
  const totalDays = quote.itineraries?.total_days || 1
  const samplePPD = (ppdAccommodation + ppdCruise) * totalDays * samplePax
  const sampleFixed = fixedTransport + fixedGuide + fixedOther
  const samplePP = (ppEntranceFees + ppMeals + ppTips + ppDomesticFlights) * samplePax
  const sampleTL = tourLeaderIncluded ? tourLeaderCost : 0
  const sampleTotal = samplePPD + sampleFixed + samplePP + sampleTL
  const samplePerPerson = sampleTotal / samplePax

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={`/quotes/b2b/${quote.id}`}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back to Quote</span>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Edit Quote {quote.quote_number}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {quote.b2b_partners?.company_name} • {quote.itineraries?.trip_name}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Error updating quote</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          {/* Basic Configuration */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Configuration</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Service Tier
                </label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="EGP">EGP (E£)</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 pt-8">
                  <input
                    type="checkbox"
                    checked={tourLeaderIncluded}
                    onChange={(e) => setTourLeaderIncluded(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Include Tour Leader (+1)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* PPD Costs */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Per Person Double (PPD) Costs</h2>
            <p className="text-sm text-gray-500 mb-4">Per person per night costs</p>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Accommodation (per night)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ppdAccommodation}
                  onChange={(e) => setPpdAccommodation(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cruise (per night)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ppdCruise}
                  onChange={(e) => setPpdCruise(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Single Supplement
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={singleSupplement}
                  onChange={(e) => setSingleSupplement(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Fixed Costs */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Fixed Costs (Per Trip)</h2>
            <p className="text-sm text-gray-500 mb-4">One-time costs regardless of pax count</p>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transportation
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fixedTransport}
                  onChange={(e) => setFixedTransport(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Guide
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fixedGuide}
                  onChange={(e) => setFixedGuide(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Other
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fixedOther}
                  onChange={(e) => setFixedOther(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Per-Person Costs */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Per-Person Costs</h2>
            <p className="text-sm text-gray-500 mb-4">Costs that scale with passenger count</p>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Entrance Fees
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ppEntranceFees}
                  onChange={(e) => setPpEntranceFees(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Meals
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ppMeals}
                  onChange={(e) => setPpMeals(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tips
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ppTips}
                  onChange={(e) => setPpTips(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Domestic Flights
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ppDomesticFlights}
                  onChange={(e) => setPpDomesticFlights(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Tour Leader Cost */}
          {tourLeaderIncluded && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Tour Leader Cost</h2>

              <div className="max-w-xs">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Tour Leader Cost
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tourLeaderCost}
                  onChange={(e) => setTourLeaderCost(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                  required
                />
                <p className="text-xs text-amber-600 mt-1">Distributed across paying passengers</p>
              </div>
            </div>
          )}

          {/* Sample Calculation */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Sample Calculation ({samplePax} pax)</h2>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">PPD Costs:</span>
                  <span className="font-medium">{currency} {samplePPD.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Fixed Costs:</span>
                  <span className="font-medium">{currency} {sampleFixed.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Per-Person Costs:</span>
                  <span className="font-medium">{currency} {samplePP.toFixed(2)}</span>
                </div>
                {tourLeaderIncluded && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tour Leader:</span>
                    <span className="font-medium">{currency} {sampleTL.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-base font-bold">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-purple-700">{currency} {sampleTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold">
                  <span className="text-gray-900">Per Person:</span>
                  <span className="text-purple-700">{currency} {samplePerPerson.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-purple-200">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  handleSubmit(e as any, true)
                }}
                disabled={saving}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Recalculate Full Pricing Table (2-30 pax)
              </button>
              <p className="text-xs text-purple-600 mt-2">
                This will regenerate the pricing table for all passenger counts based on current values
              </p>
            </div>
          </div>

          {/* Status & Validity */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Status & Validity</h2>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valid From
                </label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valid Until
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Season
                </label>
                <input
                  type="text"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="e.g., High Season"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Notes for internal use only..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Terms & Conditions
                </label>
                <textarea
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Terms and conditions for this rate sheet..."
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href={`/quotes/b2b/${quote.id}`}
              className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
  )
}
