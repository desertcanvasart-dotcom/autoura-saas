'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import WhatsAppButton from '@/app/components/whatsapp/whatsapp-button'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Edit2, Plus, X, Loader2 } from 'lucide-react'
import { generateContractPDF } from '@/lib/contract-pdf-generator'

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  client_email: string
  client_phone?: string
  num_travelers: number
  start_date: string
  end_date: string
  total_cost: number
  tour_name: string
  destinations: string
  parsed_data: any
}

interface ContractData {
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
  totalCost: number
  depositPercentage: number
  paymentTerms: string
  inclusions: string[]
  exclusions: string[]
  cancellation45Days: string
  cancellation44to30Days: string
  cancellation29to15Days: string
  cancellation14to0Days: string
  flightCancellation: string
  noShowPolicy: string
  forceMajeure: string
  specialNotes: string
}

export default function ContractPage() {
  const params = useParams()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(true)
  const [saving, setSaving] = useState(false)

  const [contractData, setContractData] = useState<ContractData>({
    contractNumber: '',
    contractDate: new Date().toISOString().split('T')[0],
    serviceProvider: 'Travel2Egypt',
    providerWebsite: 'https://travel2egypt.org/',
    providerLocation: 'Cairo, Egypt',
    clientName: '',
    clientEmail: '',
    numTravelers: 2,
    tourPackage: '',
    startDate: '',
    endDate: '',
    duration: '',
    destinations: '',
    totalCost: 0,
    depositPercentage: 10,
    paymentTerms: 'A 10% deposit is required at the time of booking to secure the reservation. The remaining balance is to be paid in cash upon arrival in Egypt.',
    inclusions: [
      'Private transportation throughout: all airport transfers',
      'Licensed private guiding: Egyptologist-naturalist for sightseeing',
      'Entrance fees to all sites listed',
      'Accommodation as specified in the itinerary',
      'Domestic flights as per itinerary',
      'Curated lunches in clean, reliable restaurants',
      'Tips for drivers, porters, and hotel concierge',
      'All taxes and service charges'
    ],
    exclusions: [
      'International flights',
      'Meals not specified in the itinerary',
      'Gratuities for your guide (appreciated but not obligatory)',
      'Travel insurance',
      'Personal expenses',
      'Visa fees (if applicable)',
      'Optional activities not mentioned in the itinerary'
    ],
    cancellation45Days: 'Cancellations received 45 days before travel date are totally refundable.',
    cancellation44to30Days: 'Cancellations received 44 days to 30 days before travel date are subject to 15% cancellation fees.',
    cancellation29to15Days: 'Cancellations received 29 days to 15 days before travel date are subject to 40% cancellation fees.',
    cancellation14to0Days: 'Cancellations received 14 days to 0 days before travel date are subject to 100% cancellation fees.',
    flightCancellation: 'Any ticket cancellation (domestic and/or international) will be subject to a 50% fee from the flight price from day 1 of booking.',
    noShowPolicy: 'Clients who fail to show up for departure without prior notification will forfeit 100% of the tour cost.',
    forceMajeure: 'In case of cancellation due to force majeure events (natural disasters, political unrest, pandemic restrictions, etc.), Travel2Egypt will work with clients to reschedule or provide credit for future travel, subject to supplier policies.',
    specialNotes: 'Safety & Comfort: Meet & assist at all airports, trusted vetted teams, 24/7 WhatsApp support.\nPractical: Bottled water provided daily, restaurants chosen for cleanliness and hygiene.'
  })

  useEffect(() => {
    if (params.id) {
      fetchItinerary(params.id as string)
    }
  }, [params.id])

  const fetchItinerary = async (id: string) => {
    try {
      const response = await fetch(`/api/itineraries/${id}`)
      const data = await response.json()
      
      if (data.success) {
        const itin = data.data
        setItinerary(itin)
        
        setContractData(prev => ({
          ...prev,
          contractNumber: `TC-2025-${itin.id.slice(0, 8).toUpperCase()}`,
          clientName: itin.client_name,
          clientEmail: itin.client_email || '',
          numTravelers: itin.num_travelers,
          tourPackage: itin.tour_name || 'Custom Egypt Tour',
          startDate: itin.start_date,
          endDate: itin.end_date,
          duration: itin.parsed_data?.duration || 'N/A',
          destinations: itin.destinations || 'Cairo, Luxor, Aswan',
          totalCost: itin.total_cost
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
      // Use client-side PDF generation
      const pdfBytes = await generateContractPDF({
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
        currency: 'USD'
      })
      
      // Download the PDF
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
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
      alert('Failed to download contract')
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

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        
        {/* COMPACT HEADER */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/itineraries"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Itineraries
          </Link>
          
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
                onSuccess={() => {
                  alert('Contract sent via WhatsApp! ✅')
                }}
              />
            )}
          </div>
        </div>

        {/* COMPACT CONTRACT FORM/PREVIEW */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-6">
          
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
                <p><strong>Date:</strong> {new Date(contractData.contractDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
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
                <p><strong>Tour Start Date:</strong> {new Date(contractData.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><strong>Tour End Date:</strong> {new Date(contractData.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
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
                  <label className="text-xs text-gray-600">Total Package Price (USD)</label>
                  <input
                    type="number"
                    value={contractData.totalCost}
                    onChange={(e) => handleChange('totalCost', parseFloat(e.target.value))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Deposit Percentage</label>
                  <input
                    type="number"
                    value={contractData.depositPercentage}
                    onChange={(e) => handleChange('depositPercentage', parseInt(e.target.value))}
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
                    Total Package Price: <span className="text-primary-600">USD ${contractData.totalCost.toLocaleString()}</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-1">
                    (USD ${(contractData.totalCost / contractData.numTravelers).toFixed(2)} per person × {contractData.numTravelers} {contractData.numTravelers === 1 ? 'traveler' : 'travelers'})
                  </p>
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
                    <p>• Domestic tickets are the only non-refundable part of the trip from day 1.</p>
                    <p>• {contractData.cancellation45Days}</p>
                    <p>• {contractData.cancellation44to30Days}</p>
                    <p>• {contractData.cancellation29to15Days}</p>
                    <p>• {contractData.cancellation14to0Days}</p>
                    <p>• Cancellation fees will be applied on accommodation portions only.</p>
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
            
            <div className="space-y-3 text-xs">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">1. BOOKING CONFIRMATION</h3>
                <p className="text-gray-700">
                  This contract becomes binding upon receipt of the required deposit and signed contract by {contractData.serviceProvider}.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">2. TRAVEL DOCUMENTS</h3>
                <p className="text-gray-700">
                  Clients are responsible for ensuring they have valid passports, visas, and any required health documentation for travel to Egypt.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">3. HEALTH AND SAFETY</h3>
                <div className="text-gray-700 space-y-0.5">
                  <p>• Clients must disclose any medical conditions that may affect their ability to participate in tour activities</p>
                  <p>• Travel insurance is strongly recommended and may be required</p>
                  <p>• Clients participate in all activities at their own risk</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">4. CHANGES TO ITINERARY</h3>
                <p className="text-gray-700">
                  {contractData.serviceProvider} reserves the right to modify the itinerary due to circumstances beyond our control. Every effort will be made to provide suitable alternatives of equal value. No refunds will be provided for missed activities due to client's personal circumstances.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">5. LIABILITY LIMITATIONS</h3>
                <p className="text-gray-700">
                  {contractData.serviceProvider}'s liability is limited to the cost of the tour package. We are not responsible for delays, cancellations, or changes made by third-party suppliers.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">6. DISPUTE RESOLUTION</h3>
                <p className="text-gray-700">
                  Any disputes arising from this contract shall be resolved through arbitration under Egyptian law.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">7. DATA PROTECTION</h3>
                <p className="text-gray-700">
                  Client information will be used solely for the purpose of providing travel services and will be handled in accordance with applicable privacy laws.
                </p>
              </div>
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
              <p className="text-xs text-gray-700">{new Date(contractData.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} (completion of tour services)</p>
              
              <p className="text-xs text-gray-500 italic mt-5">
                This contract is governed by Egyptian law and any disputes will be subject to the jurisdiction of Egyptian courts.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}