'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calculator, Download, Users, Calendar, Globe, Loader2, FileSpreadsheet, TrendingUp, AlertCircle, UserPlus, Save, X, CheckCircle2, Building2, User, Mail, Phone, FileText, XCircle } from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'

// ============================================
// B2B TOUR PRICE CALCULATOR PAGE
// File: app/b2b/calculator/[id]/page.tsx
// 
// Updated: Added +0/+1 Tour Leader toggle
// Updated: Added Single Supplement display
// Updated: Added Save Quote functionality
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
    service_id: string
    service_name: string
    service_category: string
    rate_type: string | null
    rate_source: string
    quantity_mode: string
    quantity: number
    unit_cost: number
    line_total: number
  }>
  subtotal_cost: number
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  single_supplement?: number
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

interface Partner {
  id: string
  company_name: string
  partner_code: string
}

interface SavedQuote {
  id: string
  quote_number: string
}

export default function TourPriceCalculator() {
  const params = useParams()
  const variationId = params?.id as string
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { tenant, loading: tenantLoading, isManager } = useTenant()

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
  const [tourLeaderIncluded, setTourLeaderIncluded] = useState(false)

  // Save Quote state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedQuote, setSavedQuote] = useState<SavedQuote | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [quoteForm, setQuoteForm] = useState({
    partner_id: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_nationality: '',
    notes: ''
  })

  // Authentication check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  // Fetch partners on mount
  useEffect(() => {
    if (user && tenant) {
      fetchPartners()
    }
  }, [user, tenant])

  const fetchPartners = async () => {
    try {
      const res = await fetch('/api/b2b/partners?active_only=true')
      const data = await res.json()
      if (data.success) {
        setPartners(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch partners:', err)
    }
  }

  const calculatePrice = async () => {
    setLoading(true)
    setError(null)
    setSavedQuote(null)
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
          tour_leader_included: tourLeaderIncluded
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
      const res = await fetch('/api/b2b/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variation_id: variationId,
          num_pax: 2,
          travel_date: travelDate,
          is_eur_passport: isEurPassport,
          margin_percent: marginPercent,
          tour_leader_included: tourLeaderIncluded
        })
      })
      const data = await res.json()
      
      if (data.success && data.data.pax_pricing_table) {
        const sheet: RateSheetRow[] = data.data.pax_pricing_table
          .filter((row: any) => row.numPax <= 10)
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

  const handleSaveQuote = async () => {
    if (!result) return
    
    setSaving(true)
    setError(null)
    
    try {
      const res = await fetch('/api/b2b/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variation_id: variationId,
          partner_id: quoteForm.partner_id || null,
          client_name: quoteForm.client_name || null,
          client_email: quoteForm.client_email || null,
          client_phone: quoteForm.client_phone || null,
          client_nationality: quoteForm.client_nationality || null,
          travel_date: travelDate,
          num_adults: numPax,
          num_children: 0,
          services_snapshot: result.services,
          total_cost: result.total_cost,
          margin_percent: result.margin_percent,
          margin_amount: result.margin_amount,
          selling_price: result.selling_price,
          price_per_person: result.price_per_person,
          tour_leader_included: tourLeaderIncluded,
          tour_leader_cost: result.tour_leader_cost || null,
          single_supplement: result.single_supplement || null,
          is_eur_passport: isEurPassport,
          season: result.season,
          notes: quoteForm.notes || null
        })
      })
      
      const data = await res.json()
      
      if (data.success) {
        setSavedQuote({
          id: data.data.id,
          quote_number: data.data.quote_number
        })
        setShowSaveModal(false)
        // Reset form
        setQuoteForm({
          partner_id: '',
          client_name: '',
          client_email: '',
          client_phone: '',
          client_nationality: '',
          notes: ''
        })
      } else {
        setError(data.error || 'Failed to save quote')
      }
    } catch (err) {
      setError('Failed to save quote')
    } finally {
      setSaving(false)
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

  // Show loading state while checking auth/tenant
  if (authLoading || tenantLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#647C47]" />
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
          <p className="text-gray-600 mb-4">You need manager permissions to access the B2B calculator.</p>
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
        <Link 
          href="/b2b/quotes" 
          className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
        >
          <FileText className="w-4 h-4" />
          View Saved Quotes
        </Link>
      </div>

      {/* Success Message */}
      {savedQuote && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">Quote saved successfully!</p>
              <p className="text-sm text-green-600">Reference: <span className="font-mono font-bold">{savedQuote.quote_number}</span></p>
            </div>
          </div>
          <Link
            href={`/b2b/quotes/${savedQuote.id}`}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            View Quote
          </Link>
        </div>
      )}

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

              {/* Tour Leader Toggle (+0/+1) */}
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

                {/* Save Quote Button */}
                <div className="mt-4 pt-4 border-t">
                  <button
                    onClick={() => setShowSaveModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    <Save className="w-4 h-4" />
                    Save as Quote
                  </button>
                </div>
              </div>

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

      {/* Save Quote Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Save className="w-5 h-5 text-[#647C47]" />
                Save Quote
              </h2>
              <button onClick={() => setShowSaveModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Partner Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building2 className="w-4 h-4 inline mr-1" />Partner (Optional)
                </label>
                <select
                  value={quoteForm.partner_id}
                  onChange={(e) => setQuoteForm({ ...quoteForm, partner_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-[#647C47] outline-none"
                >
                  <option value="">No partner / Direct client</option>
                  {partners.map(partner => (
                    <option key={partner.id} value={partner.id}>
                      {partner.company_name} ({partner.partner_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Client Details (Optional)</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">
                      <User className="w-3 h-3 inline mr-1" />Client Name
                    </label>
                    <input
                      type="text"
                      value={quoteForm.client_name}
                      onChange={(e) => setQuoteForm({ ...quoteForm, client_name: e.target.value })}
                      placeholder="John Smith"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      <Mail className="w-3 h-3 inline mr-1" />Email
                    </label>
                    <input
                      type="email"
                      value={quoteForm.client_email}
                      onChange={(e) => setQuoteForm({ ...quoteForm, client_email: e.target.value })}
                      placeholder="john@example.com"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      <Phone className="w-3 h-3 inline mr-1" />Phone
                    </label>
                    <input
                      type="tel"
                      value={quoteForm.client_phone}
                      onChange={(e) => setQuoteForm({ ...quoteForm, client_phone: e.target.value })}
                      placeholder="+1 234 567 8900"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">
                      <Globe className="w-3 h-3 inline mr-1" />Nationality
                    </label>
                    <input
                      type="text"
                      value={quoteForm.client_nationality}
                      onChange={(e) => setQuoteForm({ ...quoteForm, client_nationality: e.target.value })}
                      placeholder="American, British, etc."
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Notes</label>
                <textarea
                  value={quoteForm.notes}
                  onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                  placeholder="Any special requests or notes..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none resize-none"
                />
              </div>

              {/* Quote Summary */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Tour:</span>
                  <span className="font-medium">{result?.template_name}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Pax:</span>
                  <span className="font-medium">{numPax} {tourLeaderIncluded ? '(+1 TL)' : ''}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Travel Date:</span>
                  <span className="font-medium">{travelDate}</span>
                </div>
                <div className="flex justify-between pt-2 border-t mt-2">
                  <span className="text-gray-600">Selling Price:</span>
                  <span className="font-bold text-[#647C47]">€{result?.selling_price.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-white font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuote}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
                ) : (
                  <><Save className="w-4 h-4" />Save Quote</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}