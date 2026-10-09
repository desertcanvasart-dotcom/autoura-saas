'use client'

import { formatMoney } from '@/lib/currency-totals'
import { effectiveItineraryTotal } from '@/lib/itinerary-client-total'
import { browserPdfFontFor } from '@/lib/pdf/jspdf-font-browser'
import { identityFromTenant } from '@/lib/company-identity'
import { DocumentLetterhead, DocumentFooter } from '@/components/documents/Letterhead'
import { todayLocal } from '@/lib/today'
// A YYYY-MM-DD is a calendar day: new Date() read it as UTC midnight, so the
// page said "October 11" for a 12 October trip west of Greenwich (the PDF
// already used formatDateOnly).
import { formatDateOnly } from '@/lib/date-utils'
import { useTenant } from '@/app/contexts/TenantContext'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import WhatsAppButton from '@/app/components/whatsapp/whatsapp-button'
import Link from 'next/link'
import { Download, Eye, Edit2, Plus, X, Loader2 } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { BackLink, TripBreadcrumb } from '@/components/nav/TripNav'
import { contractNumber, contractTravelers, contractDuration, contractDestinations } from '@/lib/contract-facts'
import {
  cancellationLines, contractPrice, contractSettingsFromTenant, defaultContractTerms, governingLawNote,
  paymentTermsText, standardTerms, type ContractTerms,
} from '@/lib/contract-terms'

/** The contract price: the services' client total, else the stored total; null = no price yet. */
function contractTotal(itin: { total_cost?: unknown; margin_percent?: unknown; itinerary_days?: { itinerary_services?: { total_cost: number | string | null; client_price?: number | string | null }[] | null }[] }): number | null {
  const services = (itin.itinerary_days ?? []).flatMap(d => d.itinerary_services ?? [])
  const total = effectiveItineraryTotal(
    { total_cost: typeof itin.total_cost === 'number' ? itin.total_cost : null, margin_percent: itin.margin_percent },
    services
  )
  return total > 0 ? total : null
}

// The fields an itinerary actually has (the old shape named num_travelers,
// tour_name, destinations and parsed_data — none of which exist).
interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  client_email: string
  client_phone?: string
  trip_name?: string | null
  num_adults?: number | null
  num_children?: number | null
  total_days?: number | null
  start_date: string
  end_date: string
  total_cost: number | null
  currency?: string | null
  itinerary_days?: {
    day_number?: number | null
    city?: string | null
    overnight_city?: string | null
    itinerary_services?: { total_cost: number | string | null; client_price?: number | string | null }[] | null
  }[]
}

interface ContractData extends ContractTerms {
  contractNumber: string
  contractDate: string
  serviceProvider: string
  providerWebsite: string
  providerLocation: string
  clientName: string
  clientEmail: string
  numTravelers: number
  tourPackage: string
  startDate: string
  endDate: string
  duration: string
  destinations: string
  /** null = the trip has no price yet ("To be confirmed"), never NaN. */
  totalCost: number | null
}

export default function ContractPage() {
  const { tenant } = useTenant()
  const params = useParams()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(true)
  const [saving, setSaving] = useState(false)

  const [contractData, setContractData] = useState<ContractData>({
    contractNumber: '',
    contractDate: todayLocal(),
    serviceProvider: tenant?.company_name || '',
    // The agency's own details (Settings → Organization) — these defaulted to
    // Travel2Egypt's website and city for every agency.
    providerWebsite: tenant?.company_website || '',
    providerLocation: tenant?.company_address || '',
    clientName: '',
    clientEmail: '',
    numTravelers: 2,
    tourPackage: '',
    startDate: '',
    endDate: '',
    duration: '',
    destinations: '',
    totalCost: null,
    // lib/contract-terms: the same defaults the PDF and the WhatsApp send
    // use. The country, the governing law and the deposit come from
    // Settings → Organization once the tenant loads (below).
    ...defaultContractTerms({}),
  })

  // The tenant often loads after the first render: fill the provider's own
  // fields then, without overwriting anything already typed.
  const settings = contractSettingsFromTenant(tenant)

  useEffect(() => {
    if (!tenant) return
    // The operator's own deposit and country replace the generic defaults —
    // but only where nothing has been typed over them yet.
    const generic = defaultContractTerms({})
    const own = defaultContractTerms(contractSettingsFromTenant(tenant))
    setContractData(prev => ({
      ...prev,
      serviceProvider: prev.serviceProvider || tenant.company_name || '',
      providerWebsite: prev.providerWebsite || tenant.company_website || '',
      providerLocation: prev.providerLocation || tenant.company_address || '',
      ...(prev.depositPercentage === generic.depositPercentage ? { depositPercentage: own.depositPercentage } : {}),
      ...(prev.paymentTerms === generic.paymentTerms ? { paymentTerms: own.paymentTerms } : {}),
    }))
  }, [tenant])


  useEffect(() => {
    if (params.id) {
      fetchItinerary(params.id as string)
    }
  }, [params.id])

  const fetchItinerary = async (id: string) => {
    try {
      // ?include=days: the destinations are the trip's own cities.
      const response = await fetch(`/api/itineraries/${id}?include=days`)
      const data = await response.json()
      
      if (data.success) {
        const itin = data.data
        setItinerary(itin)
        
        setContractData(prev => ({
          ...prev,
          // From the itinerary itself (lib/contract-facts.ts) — these read
          // fields an itinerary does not have, then invented "Cairo, Luxor,
          // Aswan", "N/A", a blank traveller count and a 2025 number.
          contractNumber: contractNumber(itin.id),
          clientName: itin.client_name,
          clientEmail: itin.client_email || '',
          numTravelers: contractTravelers(itin) ?? 0,
          tourPackage: itin.trip_name || '',
          startDate: itin.start_date,
          endDate: itin.end_date,
          duration: contractDuration(itin) ?? '',
          destinations: contractDestinations(itin.itinerary_days ?? []),
          // The client total from the services, as the quote emails show
          // it — itineraries.total_cost is a cache that can be 0 or stale.
          totalCost: contractTotal(itin)
        }))
      }
    } catch (error) {
      console.error('Error fetching itinerary:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof ContractData, value: any) => {
    setContractData(prev => ({ ...prev, [field]: value }))
  }

  // The payment-terms sentence names the deposit: when it is still the
  // sentence written for the old percentage, follow the new one.
  const handleDepositChange = (raw: string) => {
    const pct = Math.min(100, Math.max(0, parseInt(raw, 10) || 0))
    setContractData(prev => ({
      ...prev,
      depositPercentage: pct,
      paymentTerms: prev.paymentTerms === paymentTermsText(prev.depositPercentage, settings)
        ? paymentTermsText(pct, settings)
        : prev.paymentTerms,
    }))
  }

  // What the PDF and the WhatsApp send print: everything set on this page.
  const editedTerms: ContractTerms = {
    depositPercentage: contractData.depositPercentage,
    paymentTerms: contractData.paymentTerms,
    inclusions: contractData.inclusions.filter(i => i.trim()),
    exclusions: contractData.exclusions.filter(i => i.trim()),
    cancellation45Days: contractData.cancellation45Days,
    cancellation44to30Days: contractData.cancellation44to30Days,
    cancellation29to15Days: contractData.cancellation29to15Days,
    cancellation14to0Days: contractData.cancellation14to0Days,
    flightCancellation: contractData.flightCancellation,
    noShowPolicy: contractData.noShowPolicy,
    forceMajeure: contractData.forceMajeure,
    specialNotes: contractData.specialNotes,
  }

  const handleArrayChange = (field: 'inclusions' | 'exclusions', index: number, value: string) => {
    setContractData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => i === index ? value : item)
    }))
  }

  const addArrayItem = (field: 'inclusions' | 'exclusions') => {
    setContractData(prev => ({
      ...prev,
      [field]: [...prev[field], '']
    }))
  }

  const removeArrayItem = (field: 'inclusions' | 'exclusions', index: number) => {
    setContractData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }))
  }

  const handleDownloadPDF = async () => {
    setSaving(true)
    try {
      // Loaded on demand, so the PDF library is not in the first-load bundle.
      const { generateContractPDF } = await import('@/lib/contract-pdf-generator')

      // Use client-side PDF generation
      const pdfBytes = await generateContractPDF({
        company: { ...identityFromTenant(tenant), logoUrl: tenant?.logo_url },
        contractNumber: contractData.contractNumber,
        contractDate: contractData.contractDate,
        clientName: contractData.clientName,
        clientEmail: contractData.clientEmail,
        numTravelers: contractData.numTravelers,
        tourName: contractData.tourPackage,
        startDate: contractData.startDate,
        endDate: contractData.endDate,
        destinations: contractData.destinations,
        totalCost: contractData.totalCost,
        currency: itinerary?.currency || '',
        settings,
        terms: editedTerms,
        font: await browserPdfFontFor(contractData, editedTerms, settings, identityFromTenant(tenant)),
      })
      
      // Download the PDF
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contract-${contractData.contractNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      showToast('error', 'Failed to download contract')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading contract...</p>
        </div>
      </div>
    )
  }

  if (!itinerary) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-3">Itinerary Not Found</h1>
          <Link href="/itineraries" className="text-primary-600 hover:text-primary-700 text-sm">
            ← Back to Itineraries
          </Link>
        </div>
      </div>
    )
  }

  const tripRef = { id: itinerary.id, code: itinerary.itinerary_code, name: itinerary.trip_name ?? null }

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        
        <TripBreadcrumb itineraryId={itinerary.id} trip={tripRef} current="Contract" />
        {/* COMPACT HEADER */}
        <div className="flex items-center justify-between mb-4">
          {/* A contract is its trip's: back goes to the trip, or wherever the
              user came from (the booking, the edit page). */}
          <BackLink fallbackHref={`/itineraries/${itinerary.id}`} fallbackLabel={tripRef.code || 'Trip'} trip={tripRef} />
          
          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(!editMode)}
              className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium"
            >
              {editMode ? <Eye className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              {editMode ? 'Preview' : 'Edit'}
            </button>
            
            <button
              onClick={handleDownloadPDF}
              disabled={saving}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-md hover:bg-primary-700 flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? (
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

            {itinerary?.client_phone && !editMode && (
              <WhatsAppButton 
                itineraryId={params.id as string}
                type="contract"
                contractEdits={{ ...editedTerms, tourName: contractData.tourPackage, destinations: contractData.destinations, totalCost: contractData.totalCost }}
                clientPhone={itinerary.client_phone}
                clientName={itinerary.client_name}
                onSuccess={() => {
                  showToast('success', 'Contract sent via WhatsApp! ✅')
                }}
              />
            )}
          </div>
        </div>

        {/* COMPACT CONTRACT FORM/PREVIEW */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Header: the agency's letterhead (Settings → Organization) */}
          <DocumentLetterhead company={identityFromTenant(tenant)} title="Travel Contract" number={contractData.contractNumber} />
          <div className="p-6 space-y-6">

          {/* Title */}
          <div className="text-center border-b border-gray-200 pb-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">TRAVEL CONTRACT</h1>
            {editMode ? (
              <div className="space-y-2 max-w-2xl mx-auto">
                <div className="flex items-center gap-3">
                  <label className="font-medium text-gray-700 w-32 text-right text-sm">Contract Number:</label>
                  <input
                    type="text"
                    value={contractData.contractNumber}
                    onChange={(e) => handleChange('contractNumber', e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="font-medium text-gray-700 w-32 text-right text-sm">Contract Date:</label>
                  <input
                    type="date"
                    value={contractData.contractDate}
                    onChange={(e) => handleChange('contractDate', e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-0.5 text-xs text-gray-600">
                <p><strong>Contract Number:</strong> {contractData.contractNumber}</p>
                <p><strong>Date:</strong> {formatDateOnly(contractData.contractDate, 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            )}
          </div>

          {/* Parties */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">PARTIES</h2>
            
            {editMode ? (
              <>
                <div className="mb-4 space-y-2">
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">Service Provider:</h3>
                  <input
                    type="text"
                    value={contractData.serviceProvider}
                    onChange={(e) => handleChange('serviceProvider', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder="Company Name"
                  />
                  <input
                    type="text"
                    value={contractData.providerWebsite}
                    onChange={(e) => handleChange('providerWebsite', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder="Website"
                  />
                  <input
                    type="text"
                    value={contractData.providerLocation}
                    onChange={(e) => handleChange('providerLocation', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder="Location"
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">Client(s):</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600">Primary Traveler Name</label>
                      <input
                        type="text"
                        value={contractData.clientName}
                        onChange={(e) => handleChange('clientName', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Email</label>
                      <input
                        type="email"
                        value={contractData.clientEmail}
                        onChange={(e) => handleChange('clientEmail', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>
                  <div className="w-40">
                    <label className="text-xs text-gray-600">Number of Travelers</label>
                    <input
                      type="number"
                      value={contractData.numTravelers || ''}
                      onChange={(e) => handleChange('numTravelers', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      min="1"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">Service Provider:</h3>
                  <p className="text-sm text-gray-700">{contractData.serviceProvider}</p>
                  <p className="text-gray-600 text-xs">Website: {contractData.providerWebsite}</p>
                  <p className="text-gray-600 text-xs">{contractData.providerLocation}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">Client(s):</h3>
                  <p className="text-sm text-gray-700"><strong>Primary Traveler:</strong> {contractData.clientName}</p>
                  {contractData.clientEmail && (
                    <p className="text-gray-600 text-xs">{contractData.clientEmail}</p>
                  )}
                  <p className="text-sm text-gray-700 mt-1"><strong>Number of Travelers:</strong> {contractData.numTravelers} {contractData.numTravelers === 1 ? 'person' : 'persons'}</p>
                </div>
              </>
            )}
          </div>

          {/* Tour Details */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">TOUR DETAILS</h2>
            {editMode ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600">Tour Package Name</label>
                  <input
                    type="text"
                    value={contractData.tourPackage}
                    onChange={(e) => handleChange('tourPackage', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Start Date</label>
                    <input
                      type="date"
                      value={contractData.startDate}
                      onChange={(e) => handleChange('startDate', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">End Date</label>
                    <input
                      type="date"
                      value={contractData.endDate}
                      onChange={(e) => handleChange('endDate', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Duration</label>
                  <input
                    type="text"
                    value={contractData.duration}
                    onChange={(e) => handleChange('duration', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder="8 Days / 7 Nights"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Destinations</label>
                  <input
                    type="text"
                    value={contractData.destinations}
                    onChange={(e) => handleChange('destinations', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder="Cairo, Luxor, Aswan"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm text-gray-700">
                <p><strong>Tour Package:</strong> {contractData.tourPackage}</p>
                <p><strong>Tour Start Date:</strong> {formatDateOnly(contractData.startDate, 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><strong>Tour End Date:</strong> {formatDateOnly(contractData.endDate, 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><strong>Total Duration:</strong> {contractData.duration}</p>
                <p><strong>Destinations:</strong> {contractData.destinations}</p>
              </div>
            )}
          </div>

          {/* Financial Terms */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">FINANCIAL TERMS</h2>
            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-600">Total Package Price ({itinerary?.currency || 'currency'})</label>
                  <input
                    type="number"
                    value={contractData.totalCost ?? ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      handleChange('totalCost', Number.isFinite(v) ? v : null)
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Deposit Percentage</label>
                  <input
                    type="number"
                    value={contractData.depositPercentage}
                    onChange={(e) => handleDepositChange(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    min="0"
                    max="100"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Payment Terms</label>
                  <textarea
                    value={contractData.paymentTerms}
                    onChange={(e) => handleChange('paymentTerms', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    rows={2}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="bg-primary-50 border border-primary-200 rounded-md p-4 mb-3">
                  <p className="text-lg font-bold text-gray-900">
                    Total Package Price: <span className="text-primary-600">{contractPrice(contractData.totalCost, itinerary?.currency)}</span>
                  </p>
                  {contractData.numTravelers > 0 && contractData.totalCost !== null && (
                    <p className="text-gray-600 text-xs mt-1">
                      ({formatMoney(contractData.totalCost / contractData.numTravelers, itinerary?.currency || 'EUR')} per person × {contractData.numTravelers} {contractData.numTravelers === 1 ? 'traveler' : 'travelers'})
                    </p>
                  )}
                </div>

                <h3 className="font-semibold text-gray-900 mb-2 text-sm">PAYMENT SCHEDULE</h3>
                <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-700">
                  <p>{contractData.paymentTerms}</p>
                </div>
              </>
            )}
          </div>

          {/* Inclusions */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">INCLUSIONS</h2>
            <h3 className="font-semibold text-gray-900 mb-2 text-sm">What's Included</h3>
            {editMode ? (
              <div className="space-y-1.5">
                {contractData.inclusions.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleArrayChange('inclusions', index, e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                    />
                    <button
                      onClick={() => removeArrayItem('inclusions', index)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addArrayItem('inclusions')}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Item
                </button>
              </div>
            ) : (
              <ul className="list-disc pl-5 space-y-1 text-gray-700 text-xs">
                {contractData.inclusions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}

            <h3 className="font-semibold text-gray-900 mb-2 mt-4 text-sm">What's Not Included</h3>
            {editMode ? (
              <div className="space-y-1.5">
                {contractData.exclusions.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleArrayChange('exclusions', index, e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                    />
                    <button
                      onClick={() => removeArrayItem('exclusions', index)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addArrayItem('exclusions')}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Item
                </button>
              </div>
            ) : (
              <ul className="list-disc pl-5 space-y-1 text-gray-700 text-xs">
                {contractData.exclusions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Cancellation Policy */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">CANCELLATION POLICY</h2>
            
            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-600 font-medium">45+ Days Before</label>
                  <textarea
                    value={contractData.cancellation45Days}
                    onChange={(e) => handleChange('cancellation45Days', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-600 font-medium">44-30 Days Before</label>
                  <textarea
                    value={contractData.cancellation44to30Days}
                    onChange={(e) => handleChange('cancellation44to30Days', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-600 font-medium">29-15 Days Before</label>
                  <textarea
                    value={contractData.cancellation29to15Days}
                    onChange={(e) => handleChange('cancellation29to15Days', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-600 font-medium">14-0 Days Before</label>
                  <textarea
                    value={contractData.cancellation14to0Days}
                    onChange={(e) => handleChange('cancellation14to0Days', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-600 font-medium">Flight Cancellation</label>
                  <textarea
                    value={contractData.flightCancellation}
                    onChange={(e) => handleChange('flightCancellation', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-600 font-medium">No-Show Policy</label>
                  <textarea
                    value={contractData.noShowPolicy}
                    onChange={(e) => handleChange('noShowPolicy', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-600 font-medium">Force Majeure</label>
                  <textarea
                    value={contractData.forceMajeure}
                    onChange={(e) => handleChange('forceMajeure', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">Standard Cancellation Policy</h3>
                  <div className="bg-gray-50 rounded-md p-3 space-y-1 text-xs text-gray-700">
                    <p>The following cancellation charges apply from the date written notice is received:</p>
                    {cancellationLines(contractData).map((l, i) => <p key={i}>• {l}</p>)}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">Flight Cancellation Policy</h3>
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-md p-3">
                    {contractData.flightCancellation}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">No-Show Policy</h3>
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-md p-3">
                    {contractData.noShowPolicy}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">Force Majeure</h3>
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-md p-3">
                    {contractData.forceMajeure}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Terms & Conditions */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">TERMS AND CONDITIONS</h2>
            
            {/* lib/contract-terms: the same sections the PDF prints, naming the
                country and governing law from Settings → Organization. */}
            <div className="space-y-3 text-xs">
              {standardTerms(contractData.serviceProvider, settings).map((section, i) => (
                <div key={section.title}>
                  <h3 className="font-semibold text-gray-900 mb-1">{i + 1}. {section.title.toUpperCase()}</h3>
                  {section.text.length > 1 ? (
                    <div className="text-gray-700 space-y-0.5">
                      {section.text.map((t, j) => <p key={j}>• {t}</p>)}
                    </div>
                  ) : (
                    <p className="text-gray-700">{section.text[0]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Special Notes */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">SPECIAL NOTES</h2>
            
            {editMode ? (
              <div>
                <label className="text-xs text-gray-600">Special Notes & Safety Information</label>
                <textarea
                  value={contractData.specialNotes}
                  onChange={(e) => handleChange('specialNotes', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                  rows={5}
                  placeholder="Add safety notes, practical tips, packing suggestions, etc."
                />
              </div>
            ) : (
              <div className="text-xs text-gray-700 whitespace-pre-line bg-gray-50 rounded-md p-3">
                {contractData.specialNotes}
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">SIGNATURES</h2>
            <p className="text-xs text-gray-700 mb-6">
              By signing below, both parties acknowledge they have read, understood, and agree to be bound by the terms and conditions of this contract.
            </p>

            <div className="space-y-6">
              <div>
                <p className="font-semibold text-gray-900 mb-3 text-sm">{contractData.serviceProvider}</p>
                <div className="border-b border-gray-300 w-80 mb-1.5"></div>
                <p className="text-xs text-gray-600">Date: _______________</p>
              </div>

              <div>
                <p className="font-semibold text-gray-900 mb-3 text-sm">Client Acceptance:</p>
                <div className="mb-5">
                  <p className="text-xs text-gray-700 mb-1.5">{contractData.clientName}</p>
                  <div className="border-b border-gray-300 w-80 mb-1.5"></div>
                  <p className="text-xs text-gray-600">Date: _______________</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-gray-200">
              <p className="font-semibold text-gray-900 mb-1 text-sm">Contract Effective Date:</p>
              <p className="text-xs text-gray-700">Upon receipt of signed contract and deposit payment</p>
              
              <p className="font-semibold text-gray-900 mb-1 mt-3 text-sm">Contract Expiration:</p>
              <p className="text-xs text-gray-700">{formatDateOnly(contractData.endDate, 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })} (completion of tour services)</p>
              
              <p className="text-xs text-gray-500 italic mt-5">
                {governingLawNote(settings)}
              </p>
            </div>
          </div>
          </div>

          {/* Footer: Settings → Organization */}
          <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-4">
            <DocumentFooter company={identityFromTenant(tenant)} />
          </div>
        </div>
      </div>
    </div>
  )
}