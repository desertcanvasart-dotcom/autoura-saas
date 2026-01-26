'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Mail, Phone, MapPin, Globe, Building, CreditCard, Tag,
  Star, Bell, Heart, ArrowLeft, Save, X, ChevronRight
} from 'lucide-react'
import RequireFeature from '@/components/RequireFeature'

const LEAD_SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'website', label: 'Website', icon: '🌐' },
  { value: 'referral', label: 'Referral', icon: '👥' },
  { value: 'phone', label: 'Phone', icon: '📞' },
  { value: 'social_media', label: 'Social Media', icon: '📱' },
  { value: 'trade_show', label: 'Trade Show', icon: '🎪' },
  { value: 'other', label: 'Other', icon: '➕' }
]

export default function NewClientPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(1)

  // Form data
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    alternative_phone: '',
    nationality: '',
    passport_type: 'euro_passport' as 'euro_passport' | 'other_passport',
    date_of_birth: '',
    preferred_language: 'English',
    country: '',
    city: '',
    address_line1: '',
    address_line2: '',
    postal_code: '',
    preferred_contact_method: 'whatsapp' as 'email' | 'whatsapp' | 'phone' | 'sms',
    best_time_to_contact: 'morning',
    timezone: 'Africa/Cairo',
    preferred_accommodation_level: 'moderate' as 'budget' | 'moderate' | 'luxury' | 'ultra_luxury',
    dietary_restrictions: [] as string[],
    accessibility_needs: [] as string[],
    special_interests: [] as string[],
    company_name: '',
    job_title: '',
    is_travel_agent: false,
    agent_commission_rate: 0,
    client_type: 'individual' as 'individual' | 'family' | 'group' | 'corporate' | 'agent',
    vip_status: false,
    lead_source: '',
    marketing_consent: false,
    newsletter_subscribed: false,
    sms_consent: false,
    tags: [] as string[],
    internal_notes: '',
    currency_preference: 'EUR' as 'EUR' | 'USD' | 'GBP'
  })

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Convert empty strings to null for date fields
      const cleanedData = {
        ...formData,
        date_of_birth: formData.date_of_birth || null,
      }

      const { data, error: insertError } = await supabase
        .from('clients')
        .insert([cleanedData])
        .select()
        .single()

      if (insertError) throw insertError
      router.push(`/clients/${data.id}`)
    } catch (err: any) {
      console.error('Error creating client:', err)
      setError(err.message || 'Failed to create client')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayToggle = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field as keyof typeof prev] as string[]).includes(value)
      ? (prev[field as keyof typeof prev] as string[]).filter((item: string) => item !== value)
        : [...(prev[field as keyof typeof prev] as string[]), value]
    }))
  }

  const totalSteps = 5
  const steps = [
    { num: 1, label: 'Basic Info', icon: User },
    { num: 2, label: 'Contact', icon: MapPin },
    { num: 3, label: 'Preferences', icon: Heart },
    { num: 4, label: 'Business', icon: Building },
    { num: 5, label: 'Classification', icon: Tag }
  ]

  // Reusable input class
  const inputClass = "w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
  const selectClass = "w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
  const labelClass = "block text-xs font-medium text-gray-600 mb-1"

  return (
    <RequireFeature feature="b2c">
      <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/clients"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Clients
              </Link>
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <User className="w-5 h-5 text-primary-600" />
                Add New Client
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Create a comprehensive client profile</p>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="mt-6">
            <div className="flex items-center">
              {steps.map((step, index) => (
                <div key={step.num} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(step.num)}
                    className="flex flex-col items-center flex-1 group"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all shadow-sm ${
                        currentStep >= step.num
                          ? 'bg-primary-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-400 group-hover:border-gray-300'
                      }`}
                    >
                      {step.num}
                    </div>
                    <span className={`text-[10px] mt-1.5 ${currentStep >= step.num ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </button>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${currentStep > step.num ? 'bg-primary-600' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 bg-white border border-red-200 rounded-lg p-3 shadow-sm border-l-4 border-l-red-500">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Step 1: Basic Information */}
        {currentStep === 1 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-primary-600" />
              Basic Information
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>First Name *</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                  className={inputClass}
                  placeholder="John"
                />
              </div>

              <div>
                <label className={labelClass}>Last Name *</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                  className={inputClass}
                  placeholder="Smith"
                />
              </div>

              <div>
  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
    <Mail className="w-3.5 h-3.5" />
    Email Address *
  </label>
  <input
    type="email"
    required
    value={formData.email}
    onChange={(e) => handleInputChange('email', e.target.value)}
    className={inputClass}
    placeholder="john@example.com"
  />
</div>

<div>
  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
    <Phone className="w-3.5 h-3.5" />
    Phone Number
  </label>
  <input
    type="tel"
    value={formData.phone}
    onChange={(e) => handleInputChange('phone', e.target.value)}
    className={inputClass}
    placeholder="+1 234 567 8900"
  />
</div>

              <div>
                <label className={labelClass}>Alternative Phone</label>
                <input
                  type="tel"
                  value={formData.alternative_phone}
                  onChange={(e) => handleInputChange('alternative_phone', e.target.value)}
                  className={inputClass}
                  placeholder="+1 234 567 8901"
                />
              </div>

              <div>
                <label className={labelClass}>Date of Birth</label>
                <input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Nationality</label>
                <input
                  type="text"
                  value={formData.nationality}
                  onChange={(e) => handleInputChange('nationality', e.target.value)}
                  className={inputClass}
                  placeholder="American, British, Spanish..."
                />
              </div>

              <div>
                <label className={labelClass}>Passport Type</label>
                <select
                  value={formData.passport_type}
                  onChange={(e) => handleInputChange('passport_type', e.target.value)}
                  className={selectClass}
                >
                  <option value="euro_passport">Euro Passport</option>
                  <option value="other_passport">Other Passport</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className={labelClass}>Preferred Language</label>
                <select
                  value={formData.preferred_language}
                  onChange={(e) => handleInputChange('preferred_language', e.target.value)}
                  className={selectClass}
                >
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Italian">Italian</option>
                  <option value="Arabic">Arabic</option>
                  <option value="Russian">Russian</option>
                  <option value="Chinese">Chinese</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contact & Address */}
        {currentStep === 2 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-600" />
              Contact & Address
            </h2>

            <div className="space-y-5">
              {/* Contact Preferences */}
              <div>
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Contact Preferences</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Preferred Method</label>
                    <select
                      value={formData.preferred_contact_method}
                      onChange={(e) => handleInputChange('preferred_contact_method', e.target.value)}
                      className={selectClass}
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone Call</option>
                      <option value="sms">SMS</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Best Time</label>
                    <select
                      value={formData.best_time_to_contact}
                      onChange={(e) => handleInputChange('best_time_to_contact', e.target.value)}
                      className={selectClass}
                    >
                      <option value="morning">Morning (8am-12pm)</option>
                      <option value="afternoon">Afternoon (12pm-5pm)</option>
                      <option value="evening">Evening (5pm-9pm)</option>
                      <option value="anytime">Anytime</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Timezone</label>
                    <input
                      type="text"
                      value={formData.timezone}
                      onChange={(e) => handleInputChange('timezone', e.target.value)}
                      className={inputClass}
                      placeholder="Africa/Cairo"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Address</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Country</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className={labelClass}>Address Line 1</label>
                    <input
                      type="text"
                      value={formData.address_line1}
                      onChange={(e) => handleInputChange('address_line1', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className={labelClass}>Address Line 2</label>
                    <input
                      type="text"
                      value={formData.address_line2}
                      onChange={(e) => handleInputChange('address_line2', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Postal Code</label>
                    <input
                      type="text"
                      value={formData.postal_code}
                      onChange={(e) => handleInputChange('postal_code', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Travel Preferences */}
        {currentStep === 3 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Heart className="w-4 h-4 text-primary-600" />
              Travel Preferences
            </h2>

            <div className="space-y-5">
              <div>
                <label className={labelClass}>Accommodation Level</label>
                <select
                  value={formData.preferred_accommodation_level}
                  onChange={(e) => handleInputChange('preferred_accommodation_level', e.target.value)}
                  className={selectClass}
                >
                  <option value="budget">Budget (1-2 star)</option>
                  <option value="moderate">Moderate (3 star)</option>
                  <option value="luxury">Luxury (4-5 star)</option>
                  <option value="ultra_luxury">Ultra Luxury (5+ star)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 mb-3 block">Special Interests</label>
                <div className="grid grid-cols-4 gap-2">
                  {['History', 'Photography', 'Adventure', 'Food', 'Culture', 'Shopping', 'Nature', 'Architecture'].map((interest) => (
                    <label key={interest} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.special_interests.includes(interest)}
                        onChange={() => handleArrayToggle('special_interests', interest)}
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-700">{interest}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 mb-3 block">Dietary Restrictions</label>
                <div className="grid grid-cols-4 gap-2">
                  {['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-Free', 'Lactose-Free', 'Nut Allergy', 'None'].map((restriction) => (
                    <label key={restriction} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.dietary_restrictions.includes(restriction)}
                        onChange={() => handleArrayToggle('dietary_restrictions', restriction)}
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-700">{restriction}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 mb-3 block">Accessibility Needs</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Wheelchair Access', 'Elevator Required', 'Ground Floor', 'Hearing Assistance', 'Visual Assistance', 'None'].map((need) => (
                    <label key={need} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.accessibility_needs.includes(need)}
                        onChange={() => handleArrayToggle('accessibility_needs', need)}
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-700">{need}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Business Information */}
        {currentStep === 4 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Building className="w-4 h-4 text-primary-600" />
              Business Information
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Company Name</label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => handleInputChange('company_name', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Job Title</label>
                <input
                  type="text"
                  value={formData.job_title}
                  onChange={(e) => handleInputChange('job_title', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="col-span-2 pt-3 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.is_travel_agent}
                    onChange={(e) => handleInputChange('is_travel_agent', e.target.checked)}
                    className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                  />
                  <span className="text-xs font-medium text-gray-700">This client is a travel agent</span>
                </label>
              </div>

              {formData.is_travel_agent && (
                <div>
                  <label className={labelClass}>Commission Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.agent_commission_rate}
                    onChange={(e) => handleInputChange('agent_commission_rate', parseFloat(e.target.value))}
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className={labelClass}>Currency Preference</label>
                <select
                  value={formData.currency_preference}
                  onChange={(e) => handleInputChange('currency_preference', e.target.value)}
                  className={selectClass}
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Classification & Marketing */}
        {currentStep === 5 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary-600" />
              Classification & Marketing
            </h2>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Client Type</label>
                  <select
                    value={formData.client_type}
                    onChange={(e) => handleInputChange('client_type', e.target.value)}
                    className={selectClass}
                  >
                    <option value="individual">Individual</option>
                    <option value="family">Family</option>
                    <option value="group">Group</option>
                    <option value="corporate">Corporate</option>
                    <option value="agent">Travel Agent</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Lead Source *</label>
                  <select
                    value={formData.lead_source}
                    onChange={(e) => handleInputChange('lead_source', e.target.value)}
                    className={selectClass}
                    required
                  >
                    <option value="">Select source...</option>
                    {LEAD_SOURCES.map(source => (
                      <option key={source.value} value={source.value}>
                        {source.icon} {source.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-yellow-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.vip_status}
                    onChange={(e) => handleInputChange('vip_status', e.target.checked)}
                    className="w-3.5 h-3.5 text-yellow-500 rounded border-gray-300"
                  />
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="text-xs font-medium text-gray-700">Mark as VIP Client</span>
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Marketing Preferences</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.marketing_consent}
                      onChange={(e) => handleInputChange('marketing_consent', e.target.checked)}
                      className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">Marketing communications consent</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.newsletter_subscribed}
                      onChange={(e) => handleInputChange('newsletter_subscribed', e.target.checked)}
                      className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">Subscribe to newsletter</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.sms_consent}
                      onChange={(e) => handleInputChange('sms_consent', e.target.checked)}
                      className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">SMS notifications consent</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className={labelClass}>Internal Notes</label>
                <textarea
                  rows={3}
                  value={formData.internal_notes}
                  onChange={(e) => handleInputChange('internal_notes', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="Private notes about this client..."
                />
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-5">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Previous
            </button>
          ) : (
            <Link
              href="/clients"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </Link>
          )}

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors shadow-sm"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Create Client
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
    </RequireFeature>
  )
}