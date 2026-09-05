'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Receipt,
  ChevronDown,
  ChevronUp,
  Trash2,
  Calendar,
  ExternalLink
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import Link from 'next/link'
import { getCurrencySymbol } from '@/lib/currency'

interface Expense {
  id: string
  expense_number: string
  itinerary_id: string | null
  supplier_id: string | null
  category: string
  description: string | null
  amount: number
  currency: string
  expense_date: string
  supplier_name: string | null
  supplier_type: string | null
  receipt_url: string | null
  receipt_filename: string | null
  status: string
  payment_method: string | null
  payment_date: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface ItineraryExpensesProps {
  itineraryId: string
  currency: string
  onExpensesChanged?: (expenses: Expense[]) => void
  refreshTrigger?: number
}

const CATEGORY_CONFIG: Record<string, { icon: string; label: string }> = {
  guide: { icon: '👨‍🏫', label: 'Tour Guide' },
  driver: { icon: '🚗', label: 'Driver' },
  hotel: { icon: '🏨', label: 'Hotel/Accommodation' },
  transportation: { icon: '🚐', label: 'Transportation' },
  entrance: { icon: '🎫', label: 'Entrance Fees' },
  meal: { icon: '🍽️', label: 'Meals' },
  airport_staff: { icon: '✈️', label: 'Airport Staff' },
  hotel_staff: { icon: '🛎️', label: 'Hotel Staff' },
  ground_handler: { icon: '🧳', label: 'Ground Handler' },
  tipping: { icon: '💵', label: 'Tipping' },
  permits: { icon: '📋', label: 'Permits/Permissions' },
  toll: { icon: '🛣️', label: 'Toll Fees' },
  parking: { icon: '🅿️', label: 'Parking' },
  fuel: { icon: '⛽', label: 'Fuel' },
  other: { icon: '📦', label: 'Other' }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  approved: { label: 'Approved', color: 'text-blue-700', bg: 'bg-blue-100' },
  paid: { label: 'Paid', color: 'text-green-700', bg: 'bg-green-100' },
  rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-100' }
}

export default function ItineraryExpenses({
  itineraryId,
  currency,
  onExpensesChanged,
  refreshTrigger = 0
}: ItineraryExpensesProps) {
  const dialog = useConfirmDialog()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const fetchExpenses = useCallback(async () => {
    try {
      const response = await fetch(`/api/expenses?itineraryId=${itineraryId}`)
      if (response.ok) {
        const data = await response.json()
        setExpenses(data)
        onExpensesChanged?.(data)
      }
    } catch (error) {
      console.error('Error fetching itinerary expenses:', error)
    } finally {
      setLoading(false)
    }
  }, [itineraryId, onExpensesChanged])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses, refreshTrigger])

  const handleDelete = async (expenseId: string) => {
    const confirmed = await dialog.confirmDelete('expense')
    if (!confirmed) return

    try {
      const response = await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE' })
      if (response.ok) {
        fetchExpenses()
      } else {
        await dialog.alert('Error', 'Failed to delete expense', 'warning')
      }
    } catch (error) {
      console.error('Error deleting expense:', error)
      await dialog.alert('Error', 'Failed to delete expense', 'warning')
    }
  }


  const totalAmount = expenses.reduce((sum, exp) => {
    // Sum in original currencies — display purposes
    return sum + Number(exp.amount)
  }, 0)

  // Check if all expenses are same currency
  const allSameCurrency = expenses.length > 0 && expenses.every(e => e.currency === expenses[0].currency)

  if (loading) return null
  if (expenses.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Receipt className="h-5 w-5 text-amber-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">Extra Expenses</h3>
            <p className="text-xs text-gray-500">Additional costs linked to this trip</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-500">{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</p>
              {allSameCurrency && (
                <p className="text-sm font-semibold text-amber-700">
                  {getCurrencySymbol(expenses[0].currency)}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </div>
          {expanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
        </div>
      </button>

      {/* Mobile summary */}
      <div className="md:hidden px-5 pb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>{expenses.length} expenses</span>
          {allSameCurrency && (
            <>
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-amber-700">
                {getCurrencySymbol(expenses[0].currency)}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-200">
          <div className="divide-y divide-gray-100">
            {expenses.map((expense) => {
              const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other
              const status = STATUS_CONFIG[expense.status] || STATUS_CONFIG.pending
              return (
                <div key={expense.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50">
                  {/* Category icon */}
                  <span className="text-xl flex-shrink-0">{cat.icon}</span>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {expense.description || cat.label}
                      </p>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${status.bg} ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {expense.supplier_name && (
                        <span className="text-xs text-gray-500">{expense.supplier_name}</span>
                      )}
                      {expense.supplier_name && expense.expense_date && (
                        <span className="text-gray-300">·</span>
                      )}
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(expense.expense_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      {expense.receipt_url && (
                        <>
                          <span className="text-gray-300">·</span>
                          <a
                            href={expense.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Receipt
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {getCurrencySymbol(expense.currency)}{Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {expense.currency !== currency && (
                      <p className="text-[10px] text-gray-400">{expense.currency}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Link
                      href={`/expenses/${expense.id}`}
                      className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                      title="View details"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer with total */}
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
            <p className="text-xs font-medium text-amber-800">Total Extra Expenses</p>
            <div className="text-right">
              {allSameCurrency ? (
                <p className="text-sm font-bold text-amber-800">
                  {getCurrencySymbol(expenses[0].currency)}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              ) : (
                <div>
                  {/* Show per-currency totals when mixed */}
                  {Object.entries(
                    expenses.reduce<Record<string, number>>((acc, exp) => {
                      acc[exp.currency] = (acc[exp.currency] || 0) + Number(exp.amount)
                      return acc
                    }, {})
                  ).map(([curr, total]) => (
                    <p key={curr} className="text-sm font-bold text-amber-800">
                      {getCurrencySymbol(curr)}{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  ))}
                  <p className="text-[10px] text-amber-600 mt-0.5">(converted at approximate rates)</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
