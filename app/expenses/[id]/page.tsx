'use client'

import { useState, useEffect, use } from 'react'
import { todayLocal } from '@/lib/today'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Edit2, 
  Trash2,
  Receipt,
  Calendar,
  Building,
  CreditCard,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  Wallet,
  X,
  MapPin
} from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { useConfirmDialog } from '@/components/ConfirmDialog'
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

interface Itinerary {
  id: string
  itinerary_code: string
  trip_name: string
  client_name: string
  start_date: string
  end_date: string
}

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  guide: { label: 'Tour Guide', icon: '👨‍🏫' },
  driver: { label: 'Driver', icon: '🚗' },
  hotel: { label: 'Hotel/Accommodation', icon: '🏨' },
  transportation: { label: 'Transportation', icon: '🚐' },
  entrance: { label: 'Entrance Fees', icon: '🎫' },
  meal: { label: 'Meals', icon: '🍽️' },
  airport_staff: { label: 'Airport Staff', icon: '✈️' },
  hotel_staff: { label: 'Hotel Staff', icon: '🛎️' },
  ground_handler: { label: 'Ground Handler', icon: '🧳' },
  tipping: { label: 'Tipping', icon: '💵' },
  permits: { label: 'Permits/Permissions', icon: '📋' },
  toll: { label: 'Toll Fees', icon: '🛣️' },
  parking: { label: 'Parking', icon: '🅿️' },
  fuel: { label: 'Fuel', icon: '⛽' },
  office: { label: 'Office Expenses', icon: '🏢' },
  marketing: { label: 'Marketing', icon: '📢' },
  software: { label: 'Software/Subscriptions', icon: '💻' },
  other: { label: 'Other', icon: '📦' }
}

const SUPPLIER_TYPES: Record<string, string> = {
  guide: 'Tour Guide',
  driver: 'Driver',
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  transport_company: 'Transport Company',
  airport_staff: 'Airport Staff',
  hotel_staff: 'Hotel Staff',
  ground_handler: 'Ground Handler',
  government: 'Government/Authority',
  other: 'Other'
}

const PAYMENT_METHODS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  credit_card: 'Credit Card',
  wise: 'Wise',
  paypal: 'PayPal',
  company_card: 'Company Card'
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: 'Pending', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: Clock },
  approved: { label: 'Approved', color: 'text-blue-700', bg: 'bg-blue-100', icon: CheckCircle },
  paid: { label: 'Paid', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-100', icon: AlertCircle }
}

export default function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [expense, setExpense] = useState<Expense | null>(null)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const dialog = useConfirmDialog()

  useEffect(() => {
    fetchExpense()
  }, [resolvedParams.id])

  const fetchExpense = async () => {
    try {
      const response = await fetch(`/api/expenses/${resolvedParams.id}`)
      if (response.ok) {
        const data = await response.json()
        setExpense(data)
        
        // Fetch linked itinerary if exists
        if (data.itinerary_id) {
          fetchItinerary(data.itinerary_id)
        }
      } else {
        router.push('/expenses')
      }
    } catch (error) {
      console.error('Error fetching expense:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchItinerary = async (id: string) => {
    try {
      const response = await fetch(`/api/itineraries/${id}`)
      if (response.ok) {
        const data = await response.json()
        setItinerary(data.success ? data.data : data)
      }
    } catch (error) {
      console.error('Error fetching itinerary:', error)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!expense) return
    setUpdating(true)

    try {
      const updateData: any = { status: newStatus }
      if (newStatus === 'paid' && !expense.payment_date) {
        updateData.payment_date = todayLocal()
      }

      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      if (response.ok) {
        fetchExpense()
      } else {
        showToast('error', 'Failed to update status')
      }
    } catch (error) {
      console.error('Error updating expense:', error)
      showToast('error', 'Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!expense) return
    if (!(await dialog.confirm({ message: 'Are you sure you want to delete this expense? This action cannot be undone.', variant: 'danger', confirmText: 'Delete' }))) return

    try {
      const response = await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' })
      if (response.ok) {
        router.push('/expenses')
      } else {
        showToast('error', 'Failed to delete expense')
      }
    } catch (error) {
      console.error('Error deleting expense:', error)
      showToast('error', 'Failed to delete expense')
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Expense not found</p>
        <Link href="/expenses" className="text-[#647C47] hover:underline mt-2 inline-block">
          Back to Expenses
        </Link>
      </div>
    )
  }

  const category = CATEGORIES[expense.category] || { label: expense.category, icon: '📦' }
  const statusConfig = STATUS_CONFIG[expense.status] || STATUS_CONFIG.pending
  const StatusIcon = statusConfig.icon

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/expenses"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
              {category.icon}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-gray-900">{expense.expense_number}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-sm text-gray-500">{category.label}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {expense.status === 'pending' && (
            <button
              onClick={() => handleStatusChange('approved')}
              disabled={updating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              Approve
            </button>
          )}
          {expense.status === 'approved' && (
            <button
              onClick={() => handleStatusChange('paid')}
              disabled={updating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" />
              Mark as Paid
            </button>
          )}
          <Link
            href={`/expenses?edit=${expense.id}`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Amount Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Amount</p>
                <p className="text-4xl font-bold text-gray-900">
                  {getCurrencySymbol(expense.currency)}{Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500 mb-1">Expense Date</p>
                <p className="text-lg font-medium text-gray-900">
                  {new Date(expense.expense_date).toLocaleDateString('en-US', { 
                    weekday: 'short',
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Expense Details</h3>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Category */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Category</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{category.icon}</span>
                  <span className="text-sm font-medium text-gray-900">{category.label}</span>
                </div>
              </div>

              {/* Currency */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Currency</p>
                <p className="text-sm font-medium text-gray-900">{expense.currency}</p>
              </div>

              {/* Description */}
              {expense.description && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-900">{expense.description}</p>
                </div>
              )}

              {/* Notes */}
              {expense.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{expense.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Supplier Card */}
          {(expense.supplier_name || expense.supplier_type) && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Supplier Information</h3>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Building className="h-5 w-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{expense.supplier_name || 'Unknown Supplier'}</p>
                  {expense.supplier_type && (
                    <p className="text-sm text-gray-500">{SUPPLIER_TYPES[expense.supplier_type] || expense.supplier_type}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Linked Trip Card */}
          {itinerary && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Linked Trip</h3>
              
              <Link 
                href={`/itineraries/${itinerary.id}`}
                className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-[#647C47]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{itinerary.itinerary_code}</p>
                  <p className="text-sm text-gray-500">{itinerary.client_name}</p>
                  {itinerary.start_date && (
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(itinerary.start_date).toLocaleDateString()} - {new Date(itinerary.end_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </Link>
            </div>
          )}
        </div>

        {/* Right Column - Status & Payment */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Status</h3>
            
            <div className="space-y-2">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                const Icon = config.icon
                const isActive = expense.status === key
                return (
                  <button
                    key={key}
                    onClick={() => handleStatusChange(key)}
                    disabled={updating || isActive}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isActive 
                        ? `${config.bg} ${config.color} border-current`
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    } disabled:cursor-not-allowed`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{config.label}</span>
                    {isActive && (
                      <CheckCircle className="h-4 w-4 ml-auto" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Payment Info Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Payment Information</h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Payment Method</p>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900">
                    {expense.payment_method ? PAYMENT_METHODS[expense.payment_method] || expense.payment_method : 'Not specified'}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Payment Date</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900">
                    {expense.payment_date ? new Date(expense.payment_date).toLocaleDateString() : 'Not paid yet'}
                  </span>
                </div>
              </div>

              {expense.payment_reference && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Reference</p>
                  <p className="text-sm font-mono text-gray-900 bg-gray-50 px-2 py-1 rounded">
                    {expense.payment_reference}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Receipt Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Receipt</h3>
            
            {expense.receipt_url ? (
              <a
                href={expense.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-700">View Receipt</p>
                  <p className="text-xs text-blue-600 truncate">
                    {expense.receipt_filename || 'External Link'}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-blue-500" />
              </a>
            ) : (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Receipt className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">No receipt attached</p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Created</span>
                <span>{new Date(expense.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Last Updated</span>
                <span>{new Date(expense.updated_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>ID</span>
                <span className="font-mono">{expense.id.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}