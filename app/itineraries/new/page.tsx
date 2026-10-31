'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from '@/lib/currency'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, User, Plane, Users, FileText, CalendarDays } from 'lucide-react'

export default function NewItineraryPage() {
  const router = useRouter()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    trip_name: '',
    start_date: '',
    end_date: '',
    num_adults: 2,
    num_children: 0,
    currency: 'EUR',
    notes: ''
  })
  // Start in the company's own currency (Settings → Organization), not EUR.
  const companyCurrency = tenant?.default_currency || null
  const [currencyTouched, setCurrencyTouched] = useState(false)
  useEffect(() => {
    if (companyCurrency && !currencyTouched) setFormData(prev => ({ ...prev, currency: companyCurrency }))
  }, [companyCurrency, currencyTouched])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'num_adults' || name === 'num_children' ? parseInt(value) || 0 : value
    }))
  }

  const calculateDays = () => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date)
      const end = new Date(formData.end_date)
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      return days > 0 ? days : 0
    }
    return 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!formData.client_name || !formData.trip_name || !formData.start_date || !formData.end_date) {
      setError('Please fill in all required fields')
      setLoading(false)
      return
    }

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      setError('End date must be after start date')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/itineraries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/itineraries/${data.data.id}`)
      } else {
        setError(data.error || 'Failed to create itinerary')
      }
    } catch (err) {
      setError('Error creating itinerary')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const totalDays = calculateDays()

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Create New Itinerary</h1>
            <p className="text-gray-600 mt-1">Fill in the details to create a new trip plan</p>
          </div>
          <Link 
            href="/itineraries" 
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to List
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-autoura border border-gray-200 p-8">
          
          {error && (
            <div className="mb-6 p-4 bg-danger/10 border-l-4 border-danger rounded">
              <p className="text-danger">{error}</p>
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-primary-600" />
              Client Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="client_name"
                  value={formData.client_name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="client_email"
                  value={formData.client_email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="client_phone"
                  value={formData.client_phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="+1-555-0123"
                />
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Plane className="w-5 h-5 text-primary-600" />
              Trip Details
            </h2>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trip Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="trip_name"
                  value={formData.trip_name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Classic Egypt - 7 Days"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleChange}
                    required
                    min={formData.start_date}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
              {totalDays > 0 && (
                <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
                  <p className="text-primary-900 font-medium">
                    <CalendarDays className="inline w-5 h-5 -mt-1 mr-1.5 text-primary-600" />Trip Duration: <span className="text-2xl font-bold">{totalDays}</span> {totalDays === 1 ? 'day' : 'days'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-600" />
              Passengers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Adults
                </label>
                <input
                  type="number"
                  name="num_adults"
                  value={formData.num_adults}
                  onChange={handleChange}
                  min="1"
                  max="50"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Children
                </label>
                <input
                  type="number"
                  name="num_children"
                  value={formData.num_children}
                  onChange={handleChange}
                  min="0"
                  max="50"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Currency
                </label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={(e) => { setCurrencyTouched(true); handleChange(e) }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c} value={c}>{c} ({getCurrencySymbol(c)})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700">
                <span className="font-medium">Total Passengers:</span>{' '}
                {formData.num_adults + formData.num_children} 
                {' '}({formData.num_adults} {formData.num_adults === 1 ? 'adult' : 'adults'}
                {formData.num_children > 0 && `, ${formData.num_children} ${formData.num_children === 1 ? 'child' : 'children'}`})
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-600" />
              Additional Notes
            </h2>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Add any special requests, preferences, or important information..."
            />
          </div>

          <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
            <Link
              href="/itineraries"
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold flex items-center gap-2 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Create Itinerary
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}