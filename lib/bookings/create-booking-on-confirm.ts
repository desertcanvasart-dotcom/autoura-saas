import { createAdminClient } from '@/lib/supabase-server'
import { itineraryBookingFacts } from '@/lib/bookings/booking-on-confirm'
import { resolveDepositRule } from '@/lib/bookings/deposit-rule'

/**
 * Create the booking a freshly-confirmed itinerary implies (B-item 7).
 *
 * Never throws and never blocks the confirm: any reason a booking cannot
 * honestly exist comes back as `note` for the operator. The tenant-scoped
 * itinerary row has already been fetched through RLS; the insert runs on
 * the admin client with that row's tenant_id (bookings writes follow the
 * same pattern as /api/bookings/from-quote).
 */
export async function createBookingOnConfirm(
  itineraryId: string,
  itinerary: Record<string, unknown>
): Promise<{ booking: Record<string, unknown> | null; note: string | null }> {
  try {
    const tenantId = itinerary.tenant_id
    if (typeof tenantId !== 'string') {
      return { booking: null, note: 'Booking not created: could not resolve the tenant.' }
    }
    const admin = createAdminClient()

    // Any existing booking for this itinerary — quote-born or direct —
    // means the money is already frozen somewhere; never create a second.
    const { data: existing } = await admin
      .from('bookings')
      .select('id, booking_number')
      .eq('itinerary_id', itineraryId)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle()
    if (existing) {
      return {
        booking: null,
        note: `This itinerary already has booking ${existing.booking_number}.`,
      }
    }

    const facts = itineraryBookingFacts(itinerary)
    if (!facts.ok) {
      return { booking: null, note: `Booking not created: ${facts.reason}.` }
    }

    const { data: tenantRow } = await admin
      .from('tenants')
      .select('deposit_percent, deposit_due_days')
      .eq('id', tenantId)
      .maybeSingle()
    const rule = resolveDepositRule({ tenant: tenantRow })

    const { data: bookingNumber, error: numberError } = await admin.rpc('generate_booking_number')
    if (numberError || !bookingNumber) {
      return { booking: null, note: 'Booking not created: could not generate a booking number.' }
    }

    const deposit_amount = Math.round(((facts.value.total_amount * rule.depositPercent) / 100) * 100) / 100
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + rule.depositDueDays)

    const { data: booking, error: insertError } = await admin
      .from('bookings')
      .insert({
        tenant_id: tenantId,
        itinerary_id: itineraryId,
        quote_id: null,
        quote_type: null,
        client_id: (itinerary.client_id as string | null) ?? null,
        booking_number: bookingNumber,
        booking_date: new Date().toISOString().split('T')[0],
        trip_name: facts.value.trip_name,
        start_date: facts.value.start_date,
        end_date: facts.value.end_date,
        total_days: facts.value.total_days,
        num_travelers: facts.value.num_travelers,
        total_amount: facts.value.total_amount,
        currency: facts.value.currency,
        payment_terms: `${rule.depositPercent}% deposit due within ${rule.depositDueDays} day${rule.depositDueDays === 1 ? '' : 's'}, balance before departure`,
        deposit_amount,
        deposit_percent: rule.depositPercent,
        total_paid: 0,
        balance_due: facts.value.total_amount,
        status: 'pending_deposit',
        payment_deadline: deadline.toISOString().split('T')[0],
      })
      .select()
      .single()

    if (insertError) {
      // 23505 on uq_bookings_direct_per_itinerary: a concurrent confirm won
      // the race — return ITS booking, the itinerary is booked either way.
      if (insertError.code === '23505') {
        const { data: raced } = await admin
          .from('bookings')
          .select('id, booking_number')
          .eq('itinerary_id', itineraryId)
          .eq('tenant_id', tenantId)
          .maybeSingle()
        if (raced) {
          return { booking: null, note: `This itinerary already has booking ${raced.booking_number}.` }
        }
      }
      console.error('booking-on-confirm insert failed:', insertError)
      return { booking: null, note: 'Booking not created: the insert failed — see server logs.' }
    }

    return { booking, note: null }
  } catch (err) {
    console.error('booking-on-confirm failed:', err)
    return { booking: null, note: 'Booking not created: unexpected error — see server logs.' }
  }
}
