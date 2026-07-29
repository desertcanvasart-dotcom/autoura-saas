import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  DEPARTURE_WINDOW_DAYS,
  OPEN_INVOICE_STATUSES,
  LIVE_BOOKING_STATUSES,
  AWAITING_CLIENT_QUOTE_STATUSES,
  summariseOutstanding,
  summariseQuotes,
  isDepartingSoon,
  isEngagedProposal,
  byMostRecentlyViewed,
  money,
} from '@/lib/dashboard-metrics'

/**
 * GET /api/dashboard — everything the operator dashboard renders.
 *
 * One request instead of ~16 browser round-trips, and — more importantly —
 * ONE place that reports failure. The previous dashboard ran 11 queries
 * client-side and discarded the error on 10 of them, so a broken card and an
 * empty card looked identical. Here every query's error is collected and
 * returned in `degraded`, so the UI can say "this number is unavailable"
 * instead of confidently showing 0.
 *
 * The session client is used throughout: RLS is what scopes this to the
 * operator's tenant, and a dashboard must never read across tenants.
 */

export const dynamic = 'force-dynamic'

interface Degraded {
  card: string
  reason: string
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const supabase = auth.supabase!
  const degraded: Degraded[] = []

  const now = Date.now()
  const windowEnd = new Date(now + DEPARTURE_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .split('T')[0]
  const today = new Date(now).toISOString().split('T')[0]

  const [departuresRes, invoicesRes, inboxRes, sharesRes, quotesRes, clientsRes] =
    await Promise.all([
      // 1. Departing soon — bounded in SQL, then re-checked in code so the
      //    window rule lives in one tested place.
      supabase
        .from('bookings')
        .select('id, booking_number, trip_name, start_date, status, balance_due, total_amount')
        .in('status', LIVE_BOOKING_STATUSES as unknown as string[])
        .gte('start_date', today)
        .lte('start_date', windowEnd)
        .order('start_date', { ascending: true })
        .limit(25),

      // 2. Money outstanding
      supabase
        .from('invoices')
        .select('id, invoice_number, client_name, status, balance_due, due_date')
        .in('status', OPEN_INVOICE_STATUSES as unknown as string[])
        .limit(500),

      // 3. Needs a reply
      supabase
        .from('communication_inbox')
        .select('id, thread_id, sender_name, message_snippet, channel, received_at')
        .eq('status', 'new')
        .order('received_at', { ascending: false })
        .limit(25),

      // 4. Proposals the client has opened
      supabase
        .from('itinerary_shares')
        .select('id, itinerary_id, view_count, last_viewed_at, revoked_at, itineraries(trip_name, client_name, status)')
        .is('revoked_at', null)
        .gt('view_count', 0)
        .limit(50),

      // 5. Quotes awaiting the client
      supabase
        .from('b2c_quotes')
        .select('id, quote_number, status, sent_at, valid_until, selling_price')
        .in('status', AWAITING_CLIENT_QUOTE_STATUSES as unknown as string[])
        .limit(200),

      supabase.from('clients').select('id', { count: 'exact', head: true }),
    ])

  const note = (card: string, err: { message?: string } | null) => {
    if (err) degraded.push({ card, reason: err.message || 'query failed' })
  }
  note('departures', departuresRes.error)
  note('outstanding', invoicesRes.error)
  note('inbox', inboxRes.error)
  note('proposals', sharesRes.error)
  note('quotes', quotesRes.error)
  note('clients', clientsRes.error)

  const departures = (departuresRes.data ?? [])
    .filter((b) => isDepartingSoon(b, now))
    .map((b) => ({
      id: b.id,
      reference: b.booking_number,
      tripName: b.trip_name,
      startDate: b.start_date,
      status: b.status,
      balanceDue: money(b.balance_due),
    }))

  const outstanding = summariseOutstanding(invoicesRes.data ?? [], now)
  const topOwing = (invoicesRes.data ?? [])
    .filter((i) => money(i.balance_due) > 0)
    .sort((a, b) => money(b.balance_due) - money(a.balance_due))
    .slice(0, 5)
    .map((i) => ({
      id: i.id,
      reference: i.invoice_number,
      clientName: i.client_name,
      balanceDue: money(i.balance_due),
      dueDate: i.due_date,
    }))

  const inbox = (inboxRes.data ?? []).map((m) => ({
    id: m.id,
    threadId: m.thread_id,
    sender: m.sender_name,
    snippet: m.message_snippet,
    channel: m.channel,
    receivedAt: m.received_at,
  }))

  // Only proposals still awaiting a decision are actionable — once the trip is
  // confirmed, "they read it" is no longer a prompt to call anyone.
  const proposals = (sharesRes.data ?? [])
    .filter(isEngagedProposal)
    .filter((s) => {
      const it = (s as { itineraries?: { status?: string } }).itineraries
      return !it?.status || !['confirmed', 'cancelled', 'completed'].includes(it.status)
    })
    .sort(byMostRecentlyViewed)
    .slice(0, 5)
    .map((s) => {
      const it = (s as { itineraries?: { trip_name?: string; client_name?: string } }).itineraries
      return {
        id: s.id,
        itineraryId: s.itinerary_id,
        tripName: it?.trip_name ?? 'Itinerary',
        clientName: it?.client_name ?? null,
        viewCount: money(s.view_count),
        lastViewedAt: s.last_viewed_at,
      }
    })

  const quotes = summariseQuotes(quotesRes.data ?? [], now)

  return NextResponse.json({
    success: true,
    generatedAt: new Date(now).toISOString(),
    windowDays: DEPARTURE_WINDOW_DAYS,
    departures: { count: departures.length, items: departures.slice(0, 5) },
    outstanding: { ...outstanding, items: topOwing },
    inbox: { count: inbox.length, items: inbox.slice(0, 3) },
    proposals: { count: proposals.length, items: proposals },
    quotes,
    clients: { total: clientsRes.count ?? 0 },
    // Empty means every card is trustworthy. Non-empty means SAY SO in the UI.
    degraded,
  })
}
