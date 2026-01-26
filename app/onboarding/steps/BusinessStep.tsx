'use client'

import { useState, useEffect } from 'react'
import { ArrowRight, ArrowLeft, Building2, DollarSign, Package } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'

interface BusinessStepProps {
  onNext: () => void
  onBack: () => void
  currentStep: number
  tenant: any
}

const BUSINESS_TYPES = [
  {
    value: 'b2c_and_b2b',
    label: 'B2C & B2B',
    description: 'Serve both direct clients and partner agencies',
    icon: '🌐'
  },
  {
    value: 'b2c_only',
    label: 'B2C Only',
    description: 'Focus on direct client bookings',
    icon: '👥'
  },
  {
    value: 'b2b_only',
    label: 'B2B Only',
    description: 'Work exclusively with travel agencies',
    icon: '🤝'
  }
]

const CURRENCIES = [
  { value: 'EUR', label: 'EUR (€)', flag: '🇪🇺' },
  { value: 'USD', label: 'USD ($)', flag: '🇺🇸' },
  { value: 'GBP', label: 'GBP (£)', flag: '🇬🇧' },
  { value: 'EGP', label: 'EGP (E£)', flag: '🇪🇬' }
]

const SERVICES = [
  { value: 'tours', label: 'Multi-Day Tours', icon: '🗺️' },
  { value: 'day-trips', label: 'Day Trips', icon: '🚌' },
  { value: 'packages', label: 'Travel Packages', icon: '📦' },
  { value: 'cruises', label: 'Nile Cruises', icon: '🚢' },
  { value: 'transfers', label: 'Airport Transfers', icon: '✈️' },
  { value: 'experiences', label: 'Activities & Experiences', icon: '🎭' }
]

export default function BusinessStep({ onNext, onBack, currentStep, tenant }: BusinessStepProps) {
  const [businessType, setBusinessType] = useState(tenant?.business_type || 'b2c_and_b2b')
  const [currency, setCurrency] = useState(tenant?.default_currency || 'EUR')
  const [services, setServices] = useState<string[]>(
    tenant?.services_offered || ['tours', 'day-trips', 'packages']
  )
  const [phone, setPhone] = useState(tenant?.company_phone || '')
  const [website, setWebsite] = useState(tenant?.company_website || '')
  const [saving, setSaving] = useState(false)

  const toggleService = (service: string) => {
    if (services.includes(service)) {
      setServices(services.filter(s => s !== service))
    } else {
      setServices([...services, service])
    }
  }

  const handleSave = async () => {
    if (services.length === 0) {
      showToast('Please select at least one service', 'error')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/onboarding/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_type: businessType,
          default_currency: currency,
          services_offered: services,
          company_phone: phone,
          company_website: website,
          current_step: currentStep
        })
      })

      if (response.ok) {
        showToast('Business settings saved!', 'success')
        onNext()
      } else {
        showToast('Failed to save settings', 'error')
      }
    } catch (error) {
      console.error('Error saving business config:', error)
      showToast('An error occurred', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Tell us about your business
          </h2>
          <p className="text-gray-600">
            This helps us customize your experience
          </p>
        </div>

        <div className="space-y-6">
          {/* Business Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What type of business do you operate?
            </label>
            <div className="grid md:grid-cols-3 gap-3">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setBusinessType(type.value)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    businessType === type.value
                      ? 'border-[#2d3b2d] bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-2">{type.icon}</div>
                  <div className="font-semibold text-gray-900 mb-1">
                    {type.label}
                  </div>
                  <div className="text-xs text-gray-600">
                    {type.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Default Currency
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CURRENCIES.map((curr) => (
                <button
                  key={curr.value}
                  onClick={() => setCurrency(curr.value)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    currency === curr.value
                      ? 'border-[#2d3b2d] bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{curr.flag}</div>
                  <div className="font-medium text-sm text-gray-900">
                    {curr.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What services do you offer? (Select all that apply)
            </label>
            <div className="grid md:grid-cols-2 gap-3">
              {SERVICES.map((service) => (
                <button
                  key={service.value}
                  onClick={() => toggleService(service.value)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    services.includes(service.value)
                      ? 'border-[#2d3b2d] bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{service.icon}</div>
                    <div className="font-medium text-gray-900">
                      {service.label}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Contact Information */}
          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Phone (Optional)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d3b2d] focus:border-transparent"
                placeholder="+20 123 456 7890"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website (Optional)
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d3b2d] focus:border-transparent"
                placeholder="https://yourcompany.com"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={onBack}
            className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <button
            onClick={handleSave}
            disabled={saving || services.length === 0}
            className="bg-[#2d3b2d] text-white py-2 px-6 rounded-lg hover:bg-[#3d4b3d] disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors"
          >
            {saving ? 'Saving...' : 'Continue'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
