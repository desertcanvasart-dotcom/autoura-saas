'use client'

import { useState, useEffect } from 'react'
import { Tour, TourDay, TourPricingBreakdown } from './types'
import TourSetup from './components/TourSetup'
import DayPlanner from './components/DayPlanner'
import PricingSidebar from './components/PricingSidebar'
import { Users, Globe, ArrowLeft, Save, FileDown } from 'lucide-react'

export default function TourBuilderPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [tour, setTour] = useState<Tour>({
    tour_code: '',
    tour_name: '',
    duration_days: 1,
    cities: [],
    tour_type: 'custom',
    is_template: false,
    days: []
  })
  const [pax, setPax] = useState<number>(2)
  const [isEuroPassport, setIsEuroPassport] = useState<boolean>(true)
  const [pricing, setPricing] = useState<TourPricingBreakdown | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Calculate pricing when tour data changes
  const calculatePricing = async () => {
    // Only calculate if we have at least one day with data
    if (!tour.days || tour.days.length === 0) {
      setPricing(null)
      return
    }

    // Check if at least one day has some service data
    const hasAnyServiceData = tour.days.some(day => 
      day.accommodation || day.lunch_meal || day.dinner_meal || day.guide_required
    )

    if (!hasAnyServiceData) {
      setPricing(null)
      return
    }

    setIsCalculating(true)
    try {
      const response = await fetch('/api/tours/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour,
          pax,
          is_euro_passport: isEuroPassport
        })
      })

      const data = await response.json()

      if (data.success) {
        setPricing(data.data)
      } else {
        // Silently fail if validation error - tour is still being built

        setPricing(null)
      }
    } catch (error) {
      console.error('Failed to calculate pricing:', error)
      setPricing(null)
    } finally {
      setIsCalculating(false)
    }
  }

  // Auto-calculate when relevant data changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tour.days && tour.days.length > 0) {
        calculatePricing()
      }
    }, 500) // 500ms debounce

    return () => clearTimeout(timer)
  }, [tour.days, pax, isEuroPassport])

  // Initialize days when duration changes or when days are empty
  useEffect(() => {
    if (tour.duration_days > 0) {
      // If we have no days, or wrong number of days, reinitialize
      if (!tour.days || tour.days.length !== tour.duration_days) {
        const newDays: TourDay[] = Array.from({ length: tour.duration_days }, (_, i) => ({
          day_number: i + 1,
          city: tour.cities[0] || '',
          breakfast_included: true,
          guide_required: true,
          activities: []
        }))
        setTour(prev => ({ ...prev, days: newDays }))
      }
    }
  }, [tour.duration_days])

  const handleTourSetupComplete = (setupData: Partial<Tour>) => {
    setTour(prev => ({
      ...prev,
      ...setupData,
      tour_code: setupData.tour_code || `TOUR-${Date.now()}`
    }))
    setStep(2)
  }

  const handleDayUpdate = (dayIndex: number, updatedDay: TourDay) => {
    setTour(prev => ({
      ...prev,
      days: prev.days?.map((day, idx) => 
        idx === dayIndex ? updatedDay : day
      ) || []
    }))
  }

  const handleSaveTour = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/tours/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour,
          pax,
          is_euro_passport: isEuroPassport,
          pricing
        })
      })

      const data = await response.json()

      if (data.success) {
        alert(`✅ Tour saved successfully!\n\nTour Code: ${data.data.tour_code}\nTour Name: ${data.data.tour_name}`)
      } else {
        alert(`❌ Failed to save tour:\n${data.error}`)
      }
    } catch (error) {
      console.error('Failed to save tour:', error)
      alert('❌ Error saving tour. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                🏗️ Multi-Day Tour Builder
              </h1>
              <p className="text-xs text-gray-600 mt-0.5">
                {tour.tour_name || 'Create a new tour package'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* PAX Selector */}
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <label className="text-xs font-medium text-gray-600">
                  PAX:
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={pax}
                  onChange={(e) => setPax(parseInt(e.target.value) || 1)}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* Passport Type Toggle */}
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-400" />
                <label className="text-xs font-medium text-gray-600">
                  Passport:
                </label>
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                  <button
                    onClick={() => setIsEuroPassport(true)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isEuroPassport
                        ? 'bg-gray-50 text-gray-900'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {isEuroPassport && <div className="w-1.5 h-1.5 rounded-full bg-green-600" />}
                    🇪🇺 Euro
                  </button>
                  <button
                    onClick={() => setIsEuroPassport(false)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      !isEuroPassport
                        ? 'bg-gray-50 text-gray-900'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {!isEuroPassport && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                    🌍 Non-Euro
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="mt-4 flex items-center">
            <div className={`flex items-center ${step >= 1 ? 'text-gray-900' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                step >= 1 
                  ? 'bg-white border-primary-600 text-primary-600' 
                  : 'bg-white border-gray-300 text-gray-400'
              }`}>
                {step > 1 ? '✓' : '1'}
              </div>
              <span className="ml-2 text-xs font-medium">Tour Setup</span>
            </div>
            <div className={`h-0.5 w-20 mx-3 ${step >= 2 ? 'bg-primary-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center ${step >= 2 ? 'text-gray-900' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                step >= 2 
                  ? 'bg-white border-primary-600 text-primary-600' 
                  : 'bg-white border-gray-300 text-gray-400'
              }`}>
                2
              </div>
              <span className="ml-2 text-xs font-medium">Daily Planning</span>
            </div>
            <div className={`h-0.5 w-20 mx-3 ${step >= 3 ? 'bg-primary-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center ${step >= 3 ? 'text-gray-900' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                step >= 3 
                  ? 'bg-white border-primary-600 text-primary-600' 
                  : 'bg-white border-gray-300 text-gray-400'
              }`}>
                3
              </div>
              <span className="ml-2 text-xs font-medium">Review & Save</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
        <div className="flex gap-4">
          {/* Left Side - Main Content */}
          <div className="flex-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              {step === 1 && (
                <TourSetup
                  tour={tour}
                  pax={pax}
                  isEuroPassport={isEuroPassport}
                  onComplete={handleTourSetupComplete}
                  onPaxChange={setPax}
                  onPassportTypeChange={setIsEuroPassport}
                />
              )}

              {step === 2 && (
                <DayPlanner
                  tour={tour}
                  pax={pax}
                  isEuroPassport={isEuroPassport}
                  onDayUpdate={handleDayUpdate}
                  onBack={() => setStep(1)}
                  onNext={() => setStep(3)}
                />
              )}

              {step === 3 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-lg font-bold text-gray-900">Review & Save</h2>
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Review your tour details and save the template.
                  </p>

                  <div className="space-y-3 mb-6">
                    {/* Tour Details Card */}
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-gray-900">Tour Details</h3>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs text-gray-600">Tour Name:</span>
                          <p className="text-sm font-medium text-gray-900">{tour.tour_name}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-600">Duration:</span>
                          <p className="text-sm font-medium text-gray-900">{tour.duration_days} days</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-600">Cities:</span>
                          <p className="text-sm font-medium text-gray-900">{tour.cities.join(', ')}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-600">Type:</span>
                          <p className="text-sm font-medium text-gray-900 capitalize">{tour.tour_type}</p>
                        </div>
                      </div>
                    </div>

                    {/* Pricing Card */}
                    {pricing && (
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-sm font-semibold text-gray-900">Pricing Summary</h3>
                          <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          €{pricing.totals.grand_total.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          €{pricing.per_person.toFixed(2)} per person ({pax} pax)
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(2)}
                      className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to Planning
                    </button>
                    <button
                      onClick={handleSaveTour}
                      disabled={isSaving}
                      className="flex-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? 'Saving...' : 'Save Tour'}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/tours/export-pdf', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              tour,
                              pax,
                              is_euro_passport: isEuroPassport,
                              pricing
                            })
                          })

                          const html = await response.text()
                          const blob = new Blob([html], { type: 'text/html' })
                          const url = window.URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${tour.tour_code || 'tour'}.html`
                          a.click()
                          window.URL.revokeObjectURL(url)
                        } catch (error) {
                          alert('Failed to export PDF')
                        }
                      }}
                      className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold flex items-center gap-2"
                    >
                      <FileDown className="w-4 h-4" />
                      Export PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Pricing Sidebar */}
          <div className="w-96">
            <PricingSidebar
              pricing={pricing}
              pax={pax}
              isCalculating={isCalculating}
              onRecalculate={calculatePricing}
            />
          </div>
        </div>
      </div>
    </div>
  )
}