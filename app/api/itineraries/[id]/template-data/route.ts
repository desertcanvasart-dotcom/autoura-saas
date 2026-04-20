import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET /api/itineraries/[id]/template-data
// Returns itinerary data formatted for template placeholder replacement
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const { id: itineraryId } = await params

    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .select(`
        id, itinerary_code, client_id, client_name, client_email, client_phone,
        trip_name, start_date, end_date, total_days, num_adults, num_children,
        total_cost, deposit_amount, balance_due, total_paid, currency,
        payment_status, status, pickup_time, pickup_location, notes,
        guide_notes, vehicle_notes, tier, selling_price, margin_percent
      `)
      .eq('id', itineraryId)
      .single()

    if (itineraryError || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    const { data: days } = await supabase
      .from('itinerary_days')
      .select('id, day_number, date, city, title, description, overnight_city')
      .eq('itinerary_id', itineraryId)
      .order('day_number', { ascending: true })

    const placeholderData = buildPlaceholderData(itinerary, days || [])

    return NextResponse.json({
      success: true,
      itinerary,
      days: days || [],
      placeholderData,
    })
  } catch (error: any) {
    console.error('Error fetching itinerary template data:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

function buildPlaceholderData(itinerary: any, days: any[]): Record<string, string> {
  const data: Record<string, string> = {}
  const currency = itinerary?.currency || 'EUR'

  // Client data
  data.GuestName = itinerary.client_name || ''
  data.ClientName = itinerary.client_name || ''
  data.ClientEmail = itinerary.client_email || ''
  data.ClientPhone = itinerary.client_phone || ''
  if (itinerary.client_name) {
    data.GuestFirstName = itinerary.client_name.split(' ')[0]
    data.ClientFirstName = itinerary.client_name.split(' ')[0]
  }

  // Trip
  data.TripName = itinerary.trip_name || ''
  data.TourFocus = itinerary.trip_name || ''
  data.ItineraryCode = itinerary.itinerary_code || ''
  data.BookingRef = itinerary.itinerary_code || ''

  // Dates
  if (itinerary.start_date) {
    data.Date = fmtDate(itinerary.start_date)
    data.StartDate = fmtDate(itinerary.start_date)
  }
  if (itinerary.end_date) data.EndDate = fmtDate(itinerary.end_date)
  if (itinerary.start_date && itinerary.end_date) {
    data.TripDates = fmtDateRange(itinerary.start_date, itinerary.end_date)
  }
  if (itinerary.total_days) {
    data.TotalDays = `${itinerary.total_days} days`
    data.Duration = `${itinerary.total_days} days`
  }

  // Cities
  if (days.length > 0) {
    data.City = days[0].city || ''
    data.FirstCity = days[0].city || ''
    data.LastCity = days[days.length - 1]?.city || ''
  }

  // Pickup
  data.PickupTime = itinerary.pickup_time || ''
  data.PickupLocation = itinerary.pickup_location || ''

  // Notes
  data.Notes = itinerary.notes || ''
  data.GuideNotes = itinerary.guide_notes || ''
  data.VehicleNotes = itinerary.vehicle_notes || ''

  // PAX
  data.NumAdults = String(itinerary.num_adults || 0)
  data.NumChildren = String(itinerary.num_children || 0)
  data.TotalPax = String((itinerary.num_adults || 0) + (itinerary.num_children || 0))
  data.Pax = data.TotalPax

  // Financial
  if (itinerary.total_cost != null) data.TotalCost = fmtCurrency(itinerary.total_cost, currency)
  if (itinerary.selling_price != null) data.SellingPrice = fmtCurrency(itinerary.selling_price, currency)
  if (itinerary.deposit_amount != null) data.Deposit = fmtCurrency(itinerary.deposit_amount, currency)
  if (itinerary.balance_due != null) data.BalanceDue = fmtCurrency(itinerary.balance_due, currency)
  data.Currency = currency

  // Status & tier
  data.Status = itinerary.status || ''
  if (itinerary.payment_status) data.PaymentStatus = itinerary.payment_status.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
  if (itinerary.tier) data.Tier = itinerary.tier.charAt(0).toUpperCase() + itinerary.tier.slice(1)

  data.Today = fmtDate(new Date())
  data.CompanyName = process.env.BUSINESS_NAME || 'AUTOURA'

  return data
}

function fmtCurrency(amount: number | string, currency: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return ''
  const symbols: Record<string, string> = { EUR: '\u20AC', USD: '$', GBP: '\u00A3', EGP: 'EGP ' }
  return `${symbols[currency] || currency + ' '}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtDate(date: string | Date): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}
