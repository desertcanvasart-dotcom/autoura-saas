// lib/template-placeholders.ts
import { getCurrencySymbol } from '@/lib/currency'
// Utility functions for template placeholder replacement

/**
 * Extract all {{placeholder}} patterns from text
 */
export function getPlaceholders(text: string): string[] {
  const regex = /\{\{\s*(\w+)\s*\}\}/g
  const matches: string[] = []
  let match

  while ((match = regex.exec(text)) !== null) {
    if (!matches.includes(match[1])) {
      matches.push(match[1])
    }
  }

  return matches
}

/**
 * Replace all {{placeholder}} with actual values
 */
export function replacePlaceholders(
  text: string,
  data: Record<string, string | undefined>
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key]! : match
  })
}

/**
 * Format currency based on currency code
 */
function formatCurrency(amount: number | string | undefined, currency: string = 'EUR'): string {
  if (amount === undefined || amount === null) return ''
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return ''
  
  return `${getCurrencySymbol(currency)}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/**
 * Format date in a readable format
 */
function formatDate(date: string | Date | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  })
}

/**
 * Format date range
 */
function formatDateRange(startDate: string | Date | undefined, endDate: string | Date | undefined): string {
  if (!startDate || !endDate) return ''
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return ''
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  
  return `${startMonth} - ${endFormatted}`
}

/**
 * Format payment status for display
 */
function formatPaymentStatus(status: string | undefined): string {
  if (!status) return ''
  const statusMap: Record<string, string> = {
    'not_paid': 'Not Paid',
    'deposit_paid': 'Deposit Paid',
    'partial_paid': 'Partially Paid',
    'fully_paid': 'Fully Paid',
    'overdue': 'Overdue',
  }
  return statusMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

/**
 * Build placeholder data from client and trip info
 */
export function buildPlaceholderData(
  client?: {
    name?: string
    email?: string
    phone?: string
  },
  trip?: {
    name?: string
    startDate?: string | Date
    endDate?: string | Date
    totalDays?: number
    numAdults?: number
    numChildren?: number
    totalCost?: number
    depositAmount?: number
    balanceDue?: number
    totalPaid?: number
    currency?: string
    paymentStatus?: string
    itineraryCode?: string
  },
  company?: {
    name?: string
    agentName?: string
    email?: string
    phone?: string
  }
): Record<string, string> {
  const data: Record<string, string> = {}
  const currency = trip?.currency || 'EUR'

  // Client data
  if (client?.name) {
    data.client_name = client.name
    data.client_first_name = client.name.split(' ')[0]
  }
  if (client?.email) data.client_email = client.email
  if (client?.phone) data.client_phone = client.phone

  // Trip data
  if (trip?.name) data.trip_name = trip.name
  if (trip?.itineraryCode) {
    data.itinerary_code = trip.itineraryCode
    data.booking_ref = trip.itineraryCode
    data.confirmation_number = trip.itineraryCode
  }
  if (trip?.startDate) data.start_date = formatDate(trip.startDate)
  if (trip?.endDate) data.end_date = formatDate(trip.endDate)
  if (trip?.startDate && trip?.endDate) {
    data.trip_dates = formatDateRange(trip.startDate, trip.endDate)
  }
  if (trip?.totalDays) data.total_days = `${trip.totalDays} days`
  if (trip?.numAdults !== undefined) data.num_adults = trip.numAdults.toString()
  if (trip?.numChildren !== undefined) data.num_children = trip.numChildren.toString()
  if (trip?.numAdults !== undefined && trip?.numChildren !== undefined) {
    data.total_travelers = (trip.numAdults + trip.numChildren).toString()
  }

  // Financial data
  if (trip?.totalCost !== undefined) data.total = formatCurrency(trip.totalCost, currency)
  if (trip?.depositAmount !== undefined) data.deposit = formatCurrency(trip.depositAmount, currency)
  if (trip?.balanceDue !== undefined) data.balance = formatCurrency(trip.balanceDue, currency)
  if (trip?.totalPaid !== undefined) data.total_paid = formatCurrency(trip.totalPaid, currency)
  if (trip?.currency) data.currency = trip.currency
  if (trip?.paymentStatus) data.payment_status = formatPaymentStatus(trip.paymentStatus)

  // Company data
  if (company?.name) data.company_name = company.name
  if (company?.agentName) data.agent_name = company.agentName
  if (company?.email) data.company_email = company.email
  if (company?.phone) data.company_phone = company.phone

  // Dynamic dates
  data.today = formatDate(new Date())
  
  // Calculate due dates
  const today = new Date()
  const depositDue = new Date(today)
  depositDue.setDate(depositDue.getDate() + 7)
  data.deposit_due_date = formatDate(depositDue)
  
  if (trip?.startDate) {
    const startDate = new Date(trip.startDate)
    const finalPaymentDue = new Date(startDate)
    finalPaymentDue.setDate(finalPaymentDue.getDate() - 14)
    data.final_payment_due = formatDate(finalPaymentDue)
  }

  return data
}

// Placeholder reference for documentation
export const PLACEHOLDER_REFERENCE = [
  { key: 'client_name', label: 'Full Name', example: 'John Smith' },
  { key: 'client_first_name', label: 'First Name', example: 'John' },
  { key: 'client_email', label: 'Email', example: 'john@example.com' },
  { key: 'client_phone', label: 'Phone', example: '+1 234 567 8900' },
  { key: 'trip_name', label: 'Trip Name', example: 'Cairo & Luxor Adventure' },
  { key: 'itinerary_code', label: 'Booking Reference', example: 'EGY-2024-001' },
  { key: 'start_date', label: 'Start Date', example: 'January 15, 2025' },
  { key: 'end_date', label: 'End Date', example: 'January 22, 2025' },
  { key: 'trip_dates', label: 'Date Range', example: 'Jan 15 - Jan 22, 2025' },
  { key: 'total_days', label: 'Duration', example: '7 days' },
  { key: 'total', label: 'Total Cost', example: '€3,500' },
  { key: 'deposit', label: 'Deposit Amount', example: '€1,050' },
  { key: 'balance', label: 'Balance Due', example: '€2,450' },
  { key: 'company_name', label: 'Company Name', example: 'Your Company' },
  { key: 'agent_name', label: 'Agent Name', example: 'Islam' },
  // Partner & supplier correspondence (seeded lifecycle templates use these)
  { key: 'partner_name', label: 'Partner Contact', example: 'Maria' },
  { key: 'partner_company', label: 'Partner Company', example: 'Sunrise Travel GmbH' },
  { key: 'supplier_name', label: 'Supplier Name', example: 'Nile View Hotel' },
  { key: 'details', label: 'Details / Changes', example: 'Room type upgraded to suite' },
]