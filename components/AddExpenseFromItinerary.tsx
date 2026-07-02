'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Receipt } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'

interface AddExpenseFromItineraryProps {
  itineraryId: string
  itineraryCode: string
  clientName: string
  onExpenseAdded?: () => void
}

interface FormData {
  category: string
  description: string
  amount: number
  currency: string
  expense_date: string
  supplier_name: string
  supplier_type: string
  receipt_url: string
  status: string
  payment_method: string
  notes: string
}

const CATEGORIES = [
  { value: 'guide', label: 'Tour Guide', icon: '👨‍🏫' },
  { value: 'driver', label: 'Driver', icon: '🚗' },
  { value: 'hotel', label: 'Hotel/Accommodation', icon: '🏨' },
  { value: 'transportation', label: 'Transportation', icon: '🚐' },
  { value: 'entrance', label: 'Entrance Fees', icon: '🎫' },
  { value: 'meal', label: 'Meals', icon: '🍽️' },
  { value: 'airport_staff', label: 'Airport Staff', icon: '✈️' },
  { value: 'hotel_staff', label: 'Hotel Staff', icon: '🛎️' },
  { value: 'ground_handler', label: 'Ground Handler', icon: '🧳' },
  { value: 'tipping', label: 'Tipping', icon: '💵' },
  { value: 'permits', label: 'Permits/Permissions', icon: '📋' },
  { value: 'toll', label: 'Toll Fees', icon: '🛣️' },
  { value: 'parking', label: 'Parking', icon: '🅿️' },
  { value: 'fuel', label: 'Fuel', icon: '⛽' },
  { value: 'other', label: 'Other', icon: '📦' }
]

const SUPPLIER_TYPES = [
  { value: 'guide', label: 'Tour Guide' },
  { value: 'driver', label: 'Driver' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'transport_company', label: 'Transport Company' },
  { value: 'airport_staff', label: 'Airport Staff' },
  { value: 'hotel_staff', label: 'Hotel Staff' },
  { value: 'ground_handler', label: 'Ground Handler' },
  { value: 'government', label: 'Government/Authority' },
  { value: 'other', label: 'Other' }
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'wise', label: 'Wise' },
  { value: 'company_card', label: 'Company Card' }
]

export default function AddExpenseFromItinerary({ 
  itineraryId, 
  itineraryCode, 
  clientName,
  onExpenseAdded 
}: AddExpenseFromItineraryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    category: '',
    description: '',
    amount: 0,
    currency: 'EUR',
    expense_date: new Date().toISOString().split('T')[0],
    supplier_name: '',
    supplier_type: '',
    receipt_url: '',
    status: 'pending',
    payment_method: '',
    notes: ''
  })

  const resetForm = () => {
    setFormData({
      category: '',
      description: '',
      amount: 0,
      currency: 'EUR',
      expense_date: new Date().toISOString().split('T')[0],
      supplier_name: '',
      supplier_type: '',
      receipt_url: '',
      status: 'pending',
      payment_method: '',
      notes: ''
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          itinerary_id: itineraryId
        })
      })

      if (response.ok) {
        setIsOpen(false)
        resetForm()
        onExpenseAdded?.()
      } else {
        const error = await response.json()
        showToast('error', error.error || 'Failed to save expense')
      }
    } catch (error) {
      console.error('Error saving expense:', error)
      showToast('error', 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-[#647C47] hover:text-[#647C47] transition-colors"
      >
        <Receipt className="h-4 w-4" />
        Add Expense
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Add Expense</h2>
                <p className="text-xs text-gray-500">{itineraryCode} • {clientName}</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Category & Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
                  >
                    <option value="">Select Category</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                      className="w-20 px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                    >
                      <option value="EUR">€</option>
                      <option value="USD">$</option>
                      <option value="EGP">E£</option>
                    </select>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                      step="0.01"
                      min="0"
                      required
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., Guide fee for Pyramids tour"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Expense Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, expense_date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Supplier */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Supplier Name</label>
                  <input
                    type="text"
                    value={formData.supplier_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                    placeholder="e.g., Ahmed Mohamed"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Supplier Type</label>
                  <select
                    value={formData.supplier_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_type: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    <option value="">Select Type</option>
                    {SUPPLIER_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Method</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                >
                  <option value="">Select Method</option>
                  {PAYMENT_METHODS.map(method => (
                    <option key={method.value} value={method.value}>{method.label}</option>
                  ))}
                </select>
              </div>

              {/* Receipt URL */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Receipt URL</label>
                <input
                  type="url"
                  value={formData.receipt_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, receipt_url: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}