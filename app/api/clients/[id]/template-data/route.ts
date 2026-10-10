import { tripServices } from '@/lib/itineraries/trip-services'
import { effectiveItineraryTotal } from '@/lib/itinerary-client-total'
import { formatMoney } from '@/lib/currency-totals'
import { depositDueDate } from '@/lib/template-placeholders'
import { todayInTimeZone } from '@/lib/today'
import { resolveTimeZone } from '@/lib/tenant-today'
import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { requireAuth } from '@/lib/supabase-server'

// GET /api/clients/[id]/template-data
// Returns client info + their latest itinerary for template placeholder replacement
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const { id: clientId } = await params
    const { searchParams } = new URL(request.url)
    const itineraryId = searchParams.get('itineraryId') // Optional: specific itinerary

    // RLS will automatically filter by tenant

    // Fetch client data - using first_name, last_name instead of name
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Transform client to have combined name
    const clientWithName = {
      id: client.id,
      name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
      email: client.email,
      phone: client.phone
    }

    // Fetch itinerary - either specific one or latest for this client
    let itineraryQuery = supabase
      .from('itineraries')
      .select(`
        id,
        itinerary_code,
        client_id,
        client_name,
        trip_name,
        start_date,
        end_date,
        total_days,
        num_adults,
        num_children,
        total_cost,
        deposit_amount,
        balance_due,
        total_paid,
        currency,
        margin_percent,
        payment_status,
        status
      `)
      .eq('client_id', clientId)

    if (itineraryId) {
      itineraryQuery = itineraryQuery.eq('id', itineraryId)
    } else {
      // Get the most recent itinerary
      itineraryQuery = itineraryQuery
        .order('created_at', { ascending: false })
        .limit(1)
    }

    const { data: itineraries, error: itineraryError } = await itineraryQuery

    const storedItinerary = itineraries && itineraries.length > 0 ? itineraries[0] : null
    // The client total from the services, as every other send quotes it
    // (itineraries.total_cost is a cache that can be 0 or stale).
    let latestItinerary = storedItinerary
    if (storedItinerary) {
      const { rows: priceLines } = await tripServices<{ total_cost: number | null; client_price: number | null }>(supabase, storedItinerary.id, 'total_cost, client_price')
      latestItinerary = { ...storedItinerary, total_cost: effectiveItineraryTotal(storedItinerary, priceLines) }
    }

    // Also fetch all itineraries for this client (for dropdown selection)
    const { data: allItineraries } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name, start_date, status, total_cost')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Build the placeholder data
    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const { data: depositTerms } = await supabase.from('tenants').select('deposit_due_days, timezone').eq('id', authResult.tenant_id).maybeSingle()
    const terms = depositTerms as { deposit_due_days?: number | null; timezone?: string | null } | null
    const placeholderData = buildPlaceholderData(clientWithName, latestItinerary, {
      deposit_due_days: terms?.deposit_due_days ?? null,
      // The company's own day: on the UTC server, {{today}} was yesterday in
      // Tokyo until 09:00.
      today: todayInTimeZone(resolveTimeZone(terms?.timezone)),
      company_name: senderTenant?.company_name || '',
      agent_name: (authResult.user?.user_metadata?.full_name as string) || '',
      company_email: senderTenant?.contact_email || '',
      company_phone: senderTenant?.company_phone || '',
    })

    return NextResponse.json({
      client: clientWithName,
      latestItinerary,
      allItineraries: allItineraries || [],
      placeholderData,
    })

  } catch (error: any) {
    console.error('Error fetching client template data:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper function to build placeholder data
function buildPlaceholderData(
  client: { name: string; email: string | null; phone?: string | null },
  itinerary?: any
,
  identity: { company_name?: string; agent_name?: string; company_email?: string; company_phone?: string; deposit_due_days?: number | null; today?: string } = {}
): Record<string, string> {
  const data: Record<string, string> = {}
  const currency = itinerary?.currency || 'EUR'

  // Client data
  data.client_name = client.name || ''
  data.client_first_name = client.name ? client.name.split(' ')[0] : ''
  data.client_email = client.email || ''
  if (client.phone) data.client_phone = client.phone

  // Trip data (if itinerary exists)
  if (itinerary) {
    data.trip_name = itinerary.trip_name || ''
    data.itinerary_code = itinerary.itinerary_code || ''
    data.booking_ref = itinerary.itinerary_code || ''
    data.confirmation_number = itinerary.itinerary_code || ''
    
    if (itinerary.start_date) {
      data.start_date = formatDate(itinerary.start_date)
    }
    if (itinerary.end_date) {
      data.end_date = formatDate(itinerary.end_date)
    }
    if (itinerary.start_date && itinerary.end_date) {
      data.trip_dates = formatDateRange(itinerary.start_date, itinerary.end_date)
    }
    
    if (itinerary.total_days) {
      data.total_days = `${itinerary.total_days} days`
    }
    if (itinerary.num_adults !== undefined) {
      data.num_adults = itinerary.num_adults.toString()
    }
    if (itinerary.num_children !== undefined) {
      data.num_children = itinerary.num_children.toString()
    }
    if (itinerary.num_adults !== undefined && itinerary.num_children !== undefined) {
      data.total_travelers = (itinerary.num_adults + (itinerary.num_children || 0)).toString()
    }

    // Financial data
    if (itinerary.total_cost !== undefined) {
      data.total = formatCurrency(itinerary.total_cost, currency)
    }
    if (itinerary.deposit_amount !== undefined) {
      data.deposit = formatCurrency(itinerary.deposit_amount, currency)
    }
    if (itinerary.balance_due !== undefined) {
      data.balance = formatCurrency(itinerary.balance_due, currency)
    }
    if (itinerary.total_paid !== undefined) {
      data.total_paid = formatCurrency(itinerary.total_paid, currency)
    }
    data.currency = currency
    if (itinerary.payment_status) {
      data.payment_status = formatPaymentStatus(itinerary.payment_status)
    }

    // The balance is due before the tour starts (the agency's payment terms,
    // lib/contract-terms) — not an invented 14 days before.
    if (itinerary.start_date) data.final_payment_due = formatDate(itinerary.start_date)
  }

  // Identity comes in as a parameter: this helper is synchronous and the
  // caller (GET) holds the session. It used to hardcode Travel2Egypt + a named
  // agent, signing every tenant's composed emails as someone else.
  data.company_name = identity.company_name || ''
  data.agent_name = identity.agent_name || ''
  data.company_email = identity.company_email || ''
  data.company_phone = identity.company_phone || ''

  // Dynamic dates
  // A calendar day (YYYY-MM-DD) read at UTC midnight, so it formats as itself.
  const today = new Date(`${identity.today ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  data.today = formatDate(today)
  
  // The agency's deposit days (Settings), not a fixed 7.
  data.deposit_due_date = formatDate(depositDueDate(identity.deposit_due_days, today))

  return data
}

function formatCurrency(amount: number | string | undefined, currency: string = 'EUR'): string {
  if (amount === undefined || amount === null) return ''
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return ''
  // The currency's own decimals and separators, as on every other document.
  return formatMoney(num, currency)
}

function formatDate(date: string | Date | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  // In UTC: the dates here are calendar days stored as YYYY-MM-DD, which
  // parse as UTC midnight — formatted in another zone they move a day.
  return d.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  
  return `${startMonth} - ${endFormatted}`
}

function formatPaymentStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'not_paid': 'Not Paid',
    'deposit_paid': 'Deposit Paid',
    'partial_paid': 'Partially Paid',
    'fully_paid': 'Fully Paid',
    'overdue': 'Overdue',
  }
  return statusMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}