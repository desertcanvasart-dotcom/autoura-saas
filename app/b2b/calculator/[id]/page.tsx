'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calculator, Download, Users, Calendar, Globe, Loader2, FileSpreadsheet, TrendingUp, AlertCircle, UserPlus } from 'lucide-react'

// ============================================
// B2B TOUR PRICE CALCULATOR PAGE
// File: app/b2b/calculator/[id]/page.tsx
// 
// Updated: Added +0/+1 Tour Leader toggle
// ============================================

interface PricingResult {
  variation_id: string
  variation_name: string
  template_name: string
  num_pax: number
  num_paying_pax?: number
  tour_leader_included?: boolean
  tour_leader_cost?: number
  travel_date: string
  season: string
  is_eur_passport: boolean
  services: Array<{
    // ...
  }>
  subtotal_cost: number
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  currency: string
}

interface RateSheetRow {
  pax: number
  total_cost: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  single_supplement?: number
}

export default function TourPriceCalculator() {
  const params = useParams()
  const variationId = params?.id as string

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PricingResult | null>(null)
  const [rateSheet, setRateSheet] = useState<RateSheetRow[]>([])
  const [generatingSheet, setGeneratingSheet] = useState(false)

  // Form state
  const [numPax, setNumPax] = useState(2)
  const [travelDate, setTravelDate] = useState(new Date().toISOString().split('T')[0])
  const [isEurPassport, setIsEurPassport] = useState(true)
  const [marginPercent, setMarginPercent] = useState(25)
  const [includeOptionals, setIncludeOptionals] = useState(false)
  const [tourLeaderIncluded, setTourLeaderIncluded] = useState(false) // NEW: +0/+1 toggle

  const calculatePrice = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/b2b/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variation_id: variationId,
          num_pax: numPax,
          travel_date: travelDate,
          is_eur_passport: isEurPassport,
          margin_percent: marginPercent,
          include_optionals: includeOptionals,
          tour_leader_included: tourLeaderIncluded // NEW: pass to API
        })
      })
      const data = await res.json()
      if (data.success) setResult(data.data)
      else setError(data.error || 'Failed to calculate price')
    } catch (err) {
      setError('Failed to calculate price')
    } finally {
      setLoading(false)
    }
  }

  const generateRateSheet = async () => {
    setGeneratingSheet(true)
    try {
      // Single API call - backend returns full pax_pricing_table
      const res = await fetch('/api/b2b/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variation_id: variationId,
          num_pax: 2, // Any number works - we use the table
          travel_date: travelDate,
          is_eur_passport: isEurPassport,
          margin_percent: marginPercent,
          tour_leader_included: tourLeaderIncluded
        })
      })
      const data = await res.json()
      
      if (data.success && data.data.pax_pricing_table) {
        // Use the pre-calculated table (1-40 pax already computed)
        const sheet: RateSheetRow[] = data.data.pax_pricing_table
          .filter((row: any) => row.numPax <= 10) // Show 1-10 pax
          .map((row: any) => {
            const pricing = tourLeaderIncluded ? row.withLeader : row.withoutLeader
            return {
              pax: row.numPax,
              total_cost: pricing.totalCost,
              margin_amount: pricing.marginAmount,
              selling_price: pricing.sellingPrice,
              price_per_person: pricing.pricePerPerson
            }
          })
        setRateSheet(sheet)
      } else {
        setError(data.error || 'Failed to generate rate sheet')
      }
    } catch (err) {
      setError('Failed to generate rate sheet')
    } finally {
      setGeneratingSheet(false)
    }
  }
  const exportToCSV = () => {
    if (rateSheet.length === 0) return
    const tourLeaderSuffix = tourLeaderIncluded ? ' (+1 TL)' : ' (+0)'
    const headers = ['Passengers', 'Total Cost (€)', 'Margin (€)', 'Selling Price (€)', 'Per Person (€)']
    const rows = rateSheet.map(row => [
      row.pax,
      row.total_cost.toFixed(2),
      row.margin_amount.toFixed(2),
      row.selling_price.toFixed(2),
      row.price_per_person.toFixed(2)
    ])
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rate-sheet-${result?.variation_name || 'tour'}${tourLeaderSuffix}-${travelDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getSeasonBadge = (season: string) => {
    const styles: Record<string, string> = {
      low: 'bg-green-100 text-green-700',
      high: 'bg-amber-100 text-amber-700',
      peak: 'bg-red-100 text-red-700'
    }
    return styles[season] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/tours/manager" className="p-2 hover:bg-gray-200 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#647C47]" /> B2B Price Calculator
            </h1>
            <p className="text-sm text-gray-500">Calculate dynamic pricing based on actual rates</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calculator Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Calculate Price</h2>
            <div className="space-y-4">
              {/* Number of Passengers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Users className="w-4 h-4 inline mr-1" />Number of Passengers
                </label>
                <input
                  type="number"
                  value={numPax}
                  onChange={(e) => setNumPax(parseInt(e.target.value) || 1)}
                  min="1"
                  max="50"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none"
                />
              </div>

              {/* NEW: Tour Leader Toggle (+0/+1) */}
              <div className="bg-gray-50 rounded-lg p-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <UserPlus className="w-4 h-4 inline mr-1" />Tour Leader
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTourLeaderIncluded(false)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !tourLeaderIncluded
                        ? 'bg-[#647C47] text-white'
                        : 'bg-white border text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    +0 (No TL)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTourLeaderIncluded(true)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      tourLeaderIncluded
                        ? 'bg-[#647C47] text-white'
                        : 'bg-white border text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    +1 (With TL)
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {tourLeaderIncluded 
                    ? 'Tour leader costs (meals, entrance, single room) distributed across paying guests'
                    : 'Standard calculation without tour leader'}
                </p>
              </div>

              {/* Travel Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />Travel Date
                </label>
                <input
                  type="date"
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none"
                />
              </div>

              {/* Passport Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Globe className="w-4 h-4 inline mr-1" />Passport Type
                </label>
                <select
                  value={isEurPassport ? 'eur' : 'non-eur'}
                  onChange={(e) => setIsEurPassport(e.target.value === 'eur')}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="eur">European Passport</option>
                  <option value="non-eur">Non-European Passport</option>
                </select>
              </div>

              {/* Profit Margin */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <TrendingUp className="w-4 h-4 inline mr-1" />Profit Margin (%)
                </label>
                <input
                  type="number"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                  min="0"
                  max="100"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none"
                />
              </div>

              {/* Include Optionals */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOptionals}
                  onChange={(e) => setIncludeOptionals(e.target.checked)}
                  className="w-4 h-4 text-[#647C47] rounded"
                />
                <span className="text-sm">Include optional extras</span>
              </label>

              {/* Calculate Button */}
              <button
                onClick={calculatePrice}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium disabled:opacity-50"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Calculating...</>
                ) : (
                  <><Calculator className="w-4 h-4" />Calculate Price</>
                )}
              </button>

              {/* Generate Rate Sheet Button */}
              <button
                onClick={generateRateSheet}
                disabled={generatingSheet}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                {generatingSheet ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
                ) : (
                  <><FileSpreadsheet className="w-4 h-4" />Generate Rate Sheet (1-10 pax)</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Pricing Result */}
          {result && (
            <>
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{result.template_name}</h2>
                    <p className="text-sm text-gray-500">{result.variation_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* NEW: Show tour leader badge if included */}
                    {result.tour_leader_included && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        +1 Tour Leader
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getSeasonBadge(result.season)}`}>
                      {result.season.charAt(0).toUpperCase() + result.season.slice(1)} Season
                    </span>
                  </div>
                </div>

                {/* NEW: Show paying pax vs total pax if tour leader included */}
                {result.tour_leader_included && result.num_paying_pax && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                    <strong>Group:</strong> {result.num_pax} total ({result.num_paying_pax} paying guests + 1 tour leader)
                    {result.tour_leader_cost && (
                      <span className="ml-2">• <strong>TL Cost:</strong> €{result.tour_leader_cost.toFixed(2)}</span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Total Cost</p>
                    <p className="text-xl font-bold">€{result.total_cost.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Margin ({result.margin_percent}%)</p>
                    <p className="text-xl font-bold text-green-600">€{result.margin_amount.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#647C47]/10 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Selling Price</p>
                    <p className="text-xl font-bold text-[#647C47]">€{result.selling_price.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#647C47]/10 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Per Person</p>
                    <p className="text-xl font-bold text-[#647C47]">€{result.price_per_person.toFixed(2)}</p>
                  </div>
                </div>
              </div>
                 {/* Single Supplement Display */}
                {result.single_supplement && result.single_supplement > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-amber-800">
                        Single Supplement (for solo travelers)
                      </span>
                      <span className="text-lg font-bold text-amber-700">
                        €{result.single_supplement.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">
                      Additional charge per person for single room occupancy
                    </p>
                  </div>
                )}
                
              {/* Cost Breakdown Table */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-base font-semibold mb-4">Cost Breakdown</h3>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Service</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-600">Source</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-600">Mode</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Qty</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Unit</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.services.map((service, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{service.service_name}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            service.rate_source === 'stored'
                              ? 'bg-gray-100'
                              : service.rate_source === 'manual'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {service.rate_type || service.rate_source}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-gray-500">{service.quantity_mode}</td>
                        <td className="px-4 py-2 text-right">{service.quantity}</td>
                        <td className="px-4 py-2 text-right">€{service.unit_cost.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-medium">€{service.line_total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-medium">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right">Subtotal:</td>
                      <td className="px-4 py-2 text-right">€{result.subtotal_cost.toFixed(2)}</td>
                    </tr>
                    {/* NEW: Show tour leader cost as separate line */}
                    {result.tour_leader_included && result.tour_leader_cost && (
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-right text-blue-600">Tour Leader Cost:</td>
                        <td className="px-4 py-2 text-right text-blue-600">€{result.tour_leader_cost.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right text-green-600">Margin ({result.margin_percent}%):</td>
                      <td className="px-4 py-2 text-right text-green-600">€{result.margin_amount.toFixed(2)}</td>
                    </tr>
                    <tr className="text-lg">
                      <td colSpan={5} className="px-4 py-2 text-right text-[#647C47]">Total:</td>
                      <td className="px-4 py-2 text-right text-[#647C47]">€{result.selling_price.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {/* Rate Sheet */}
          {rateSheet.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold">Rate Sheet</h3>
                  {tourLeaderIncluded && (
                    <p className="text-xs text-blue-600">+1 Tour Leader included in calculations</p>
                  )}
                </div>
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                >
                  <Download className="w-4 h-4" />Export CSV
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-center font-medium text-gray-600">Pax</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Cost</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Margin</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Selling</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Per Person</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rateSheet.map((row) => (
                    <tr key={row.pax} className={`hover:bg-gray-50 ${row.pax === numPax ? 'bg-[#647C47]/5' : ''}`}>
                      <td className="px-4 py-2 text-center font-medium">
                        {row.pax}
                        {tourLeaderIncluded && <span className="text-xs text-blue-500 ml-1">(+1)</span>}
                      </td>
                      <td className="px-4 py-2 text-right">€{row.total_cost.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-green-600">€{row.margin_amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium">€{row.selling_price.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-[#647C47]">€{row.price_per_person.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}