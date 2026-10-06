// ============================================
// POST /api/pricing-grid/save
// Save grid to itinerary + services (B2C/B2B)
// ============================================
//
// Pricing parity note: per-service costs are derived from the grid's
// passport-aware `selectedItems` (rateEur / rateNonEur) exactly as in
// travel-ops-pro — group slots charged once, per-person slots × pax, custom
// amounts honoured. The tenant_id / client_id persistence model is the
// sibling's own and is preserved unchanged. A B2B quote is not made here — the
// grid asks /api/b2b/quote-from-itinerary for it after the save.

import { NextRequest, NextResponse } from 'next/server'
import { resolveMarginPercent } from '@/lib/pricing/resolve-margin'
import { ratePin } from '@/lib/pricing/rate-pin'
import { gridDayComponents } from '@/lib/pricing/grid-day-components'
import { gridOvernightCities } from '@/lib/itineraries/grid-overnight'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { resolveGridClient } from '@/lib/grid-client-link'
import { findOpenGridQuote, quotePriceFields } from '@/lib/pricing/grid-quote-sync'
import { soldItems, customAmountSold } from '@/app/pricing-grid/lib/guide-rule'
import { BASIS_SLOTS, itemCost } from '@/app/pricing-grid/lib/item-basis'
import { soldAccommodationItems } from '@/app/pricing-grid/lib/single-supplement'
import type { Json, TablesInsert } from '@/types/database.types'

function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `ITN-S-${year}-${random}`
}

// A selected rate as the grid sends it.
interface SavedGridItem {
  rateId: string; name?: string; rateEur?: number; rateNonEur?: number
  /** Per group / per person / per unit (item-basis.ts). */
  pricingBasis?: 'flat' | 'per_person' | 'per_unit'; unitCapacity?: number | null
}

// Group slots are charged once for the whole group; per-person slots scale by pax.
const GRID_GROUP_SLOTS = ['route', 'guide', 'airport_services', 'hotel_services', 'tipping', 'boat_rides', 'other_group']

// Passport-aware rate for one selected item (mirrors calculator.ts getRate).
function itemRate(item: any, passport: string): number {
  return passport === 'eu' ? (Number(item.rateEur) || 0) : (Number(item.rateNonEur) || 0)
}

// The slot's items the quote actually charges: guide off drops the guide
// (guide-rule.ts); the accommodation single supplement is sold only to a party
// of one (single-supplement.ts). Both are the calculator's own rules.
function slotSoldItems(slot: any, pax: number, withGuide: boolean): SavedGridItem[] {
  const sold = soldItems<SavedGridItem>(slot, withGuide)
  return slot.slotId === 'accommodation' ? soldAccommodationItems(sold, pax) : sold
}

// Supplier (cost) total for one slot under the given passport, before margin.
// Only what is SOLD (slotSoldItems).
function slotSupplierCost(slot: any, passport: string, pax: number, withGuide: boolean): number {
  const isGroup = GRID_GROUP_SLOTS.includes(slot.slotId)
  if (slot.customAmount && slot.customAmount > 0 && customAmountSold(slot.slotId, withGuide)) {
    return isGroup ? slot.customAmount : slot.customAmount * pax
  }
  let line = 0
  for (const item of slotSoldItems(slot, pax, withGuide)) {
    const rate = itemRate(item, passport)
    // Airport / hotel services and activities: by the item's own basis.
    if (BASIS_SLOTS.has(slot.slotId)) line += itemCost(slot.slotId, item, rate, pax).lineTotal
    else line += isGroup ? rate : rate * pax
  }
  return line
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id, user } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const body = await request.json()
    const { config, days, totals } = body
    // Throughout-guide synthetic rows (B-item 3): computed by the grid's own
    // pure math client-side; written verbatim, tagged for the reload parser.
    const throughoutExtras: Array<{ dayNumber: number; kind: string; label: string; amountEur: number }> =
      Array.isArray(body.throughout_extras) ? body.throughout_extras : []

    if (!config || !days || !totals) {
      return NextResponse.json({ success: false, error: 'Missing config, days, or totals' }, { status: 400 })
    }

    const pax = Math.max(config.pax || 1, 1)
    const passport = config.passport || 'non_eu'
    // Missing on older clients = the guide was on (the grid's default).
    const withGuide = config.withGuide !== false
    const itineraryCode = generateItineraryCode()

    // Calculate dates
    const startDate = config.startDate || new Date().toISOString().split('T')[0]
    const totalDays = days.length
    const endDate = new Date(new Date(startDate).getTime() + (totalDays - 1) * 86400000).toISOString().split('T')[0]

    // Server-authoritative pricing total. Sum the exact services we're about to
    // write (the source of truth) from the passport-aware selectedItems instead
    // of trusting the client `totals` to be present/non-zero — that's why
    // itinerary.total_cost previously persisted 0 while the services held real
    // prices. total_cost stores the CLIENT/selling price (how the header,
    // invoice and PDF consume it).
    const supplierTotal = (days || []).reduce((sum: number, day: any) => {
      return sum + (day.slots || []).reduce((dsum: number, slot: any) => {
        return dsum + slotSupplierCost(slot, passport, pax, withGuide)
      }, 0)
    }, 0)
    // `resolveMarginPercent`, not `|| 25`: 0 is an at-cost grid, and `0 || 25`
    // resold it at 25%.
    const marginPct = resolveMarginPercent({ explicit: config.marginPercent }).marginPercent
    const round2 = (n: number) => Math.round(n * 100) / 100
    const computedSupplierTotal = round2(supplierTotal)
    const computedSellingTotal = round2(supplierTotal * (1 + marginPct / 100))
    // Prefer the grid's exact client totals when present; else use the
    // server-computed figures so we never persist 0 when services exist.
    const finalSupplierTotal = (totals?.totalCost && totals.totalCost > 0) ? totals.totalCost : computedSupplierTotal
    const finalSellingTotal = (totals?.sellingPriceTotal && totals.sellingPriceTotal > 0) ? totals.sellingPriceTotal : computedSellingTotal

    // 0. The CRM client this trip belongs to: the one the grid was opened for,
    //    else a match by email/phone, else (direct travellers) a new Lead.
    const clientLink = await resolveGridClient(supabase, tenant_id, {
      clientId: config.clientId,
      name: config.clientName,
      email: config.clientEmail,
      phone: config.clientPhone,
      source: config.clientSource === 'email' || config.clientSource === 'whatsapp' ? config.clientSource : null,
      allowCreate: config.clientType !== 'b2b',
    })
    const clientId = clientLink.clientId

    // 1. Create/update itinerary record
    const itineraryData: TablesInsert<'itineraries'> = {
      tenant_id,
      itinerary_code: itineraryCode,
      client_id: clientId,
      client_name: config.clientName || null,
      client_email: config.clientEmail || null,
      client_phone: config.clientPhone || null,
      trip_name: config.tourName || `Tour ${itineraryCode}`,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      num_adults: pax,
      num_children: 0,
      tier: config.tier || 'standard',
      // Was hardcoded 'land-package' — EVERY grid-saved itinerary was
      // stamped a land package whatever it actually was, and anything
      // reading the field downstream believed it. The grid is told the
      // product now; missing (older clients) means full-package, the shape
      // the gate always assumed.
      package_type: config.packageType || 'full-package',
      total_cost: finalSellingTotal,
      selling_price: finalSellingTotal,
      // The SAME resolved value the price was computed from above.
      // `config.marginPercent || 25` stored 25 for an at-cost grid whose
      // price had been calculated at 0 — the record then disagreed with
      // its own total.
      margin_percent: marginPct,
      profit: round2(finalSellingTotal - finalSupplierTotal),
      currency: config.currency || 'EUR',
      status: 'draft',
      notes: `Created via Pricing Grid | ${config.clientType?.toUpperCase()} | ${pax} pax`,
    }

    // Try with new columns, fallback without
    let itinerary: any
    if (config.itineraryId) {
      // Update existing. A re-save changes the trip and its price — it does
      // not rename it (a fresh random code on every save broke every
      // reference to it), re-open it as a draft, or overwrite its notes.
      // Re-saving never unlinks: with no client resolved, the itinerary keeps
      // whichever client it already had.
      const {
        client_id: _clientId, itinerary_code: _code, status: _status, notes: _notes, trip_name: _tripName,
        ...changes
      } = itineraryData
      const update = {
        ...changes,
        ...(clientId ? { client_id: clientId } : {}),
        ...(config.tourName ? { trip_name: config.tourName } : {}),
      }
      const { data, error } = await supabase
        .from('itineraries')
        .update(update)
        .eq('id', config.itineraryId)
        .select()
        .single()
      if (error) throw error
      itinerary = data
      // The old days are replaced inside save_pricing_grid_days (below), in
      // the same transaction as the new ones — deleting them here first
      // would leave an itinerary with no days if the save then failed.
    } else {
      // Create new
      try {
        const { data, error } = await supabase
          .from('itineraries')
          .insert({
            ...itineraryData,
            nationality: config.nationality || null,
            is_euro_passport: config.passport === 'eu',
          })
          .select()
          .single()
        if (error) throw error
        itinerary = data
      } catch (colError: any) {
        // Fallback without new columns
        if (colError.message?.includes('Could not find')) {
          const { data, error } = await supabase
            .from('itineraries')
            .insert(itineraryData)
            .select()
            .single()
          if (error) throw error
          itinerary = data
        } else {
          throw colError
        }
      }
    }

    const itineraryId = itinerary.id
    // The client the saved itinerary actually carries (a re-save keeps its own).
    const linkedClientId: string | null = clientId ?? itinerary.client_id ?? null

    // 2. Days and their services — built here, written in ONE transaction by
    //    save_pricing_grid_days (migration 391). It used to delete the old
    //    days and insert day by day, only logging a failed day or service and
    //    carrying on: a failure part-way left the itinerary missing days or
    //    services while the save still answered success. Now any error rolls
    //    the whole write back and the previous days survive.
    const dayPayload: Array<Record<string, unknown>> = []
    // Where each night is spent: the booked hotel's city, not the day's
    // sightseeing city (lib/itineraries/overnight-city.ts).
    const overnightByDay = await gridOvernightCities(supabase as unknown as Parameters<typeof gridOvernightCities>[0], days)

    for (const day of days) {
      const dayDate = new Date(new Date(startDate).getTime() + (day.dayNumber - 1) * 86400000)
        .toISOString().split('T')[0]

      // 3. Services from non-empty slots. One service row per selected
      //    item (passport-aware rate), plus custom-amount slots. Group slots are
      //    charged once; per-person slots × pax — identical to calculator.ts.
      const services: any[] = []
      for (const slot of day.slots) {
        // Only what the grid SOLD — guide off leaves the guide out, and a
        // party of more than one the single supplement, exactly as the price
        // does (slotSoldItems).
        const sold = slotSoldItems(slot, pax, withGuide)
        const hasItems = sold.length > 0
        const hasCustom = slot.customAmount && slot.customAmount > 0 && customAmountSold(slot.slotId, withGuide)
        if (!hasItems && !hasCustom) continue

        const isGroup = GRID_GROUP_SLOTS.includes(slot.slotId)
        const serviceType = getServiceType(slot.slotId)

        if (hasCustom) {
          const unit = slot.customAmount
          services.push({
            service_type: serviceType,
            service_name: slot.slotId === 'other_group' ? 'Other (Group)' : 'Other (Per Person)',
            description: `[pricing-grid:${slot.slotId}] custom`,
            quantity: isGroup ? 1 : pax,
            unit_cost: unit,
            total_cost: isGroup ? unit : unit * pax,
            is_included: true,
          })
          continue
        }

        for (const item of sold) {
          const rate = itemRate(item, passport)
          // Airport / hotel services and activities: quantity and total by the
          // item's own basis (per group / per person / per unit).
          const byBasis = BASIS_SLOTS.has(slot.slotId) ? itemCost(slot.slotId, item, rate, pax) : null
          services.push({
            service_type: serviceType,
            service_name: item.name || slot.slotId.replace(/_/g, ' '),
            description: `[pricing-grid:${slot.slotId}] ${item.name || ''}`,
            quantity: byBasis ? byBasis.quantity : isGroup ? 1 : pax,
            unit_cost: rate,
            total_cost: byBasis ? byBasis.lineTotal : isGroup ? rate : rate * pax,
            is_included: true,
            // The pin (migration 353): which rate row this line was priced
            // from, so a later re-price (B2B quote, single supplement) reads
            // THAT row instead of re-choosing one by tier.
            ...ratePin(slot.slotId, item.rateId),
          })
        }
      }

      // Throughout guide (B-item 3): synthetic GROUP rows carrying his
      // bed/meals/flight seats onto the saved itinerary — so any quote
      // built from it carries the money. Tagged so the reload parser skips
      // them (they are DERIVED from the slots; reloading must never double
      // them back in).
      for (const extra of throughoutExtras.filter((e: { dayNumber: number }) => e.dayNumber === day.dayNumber)) {
        const kind = String(extra.kind)
        services.push({
          service_type: kind === 'bed' ? 'accommodation' : kind === 'meal' ? 'meal' : 'flight',
          service_name: String(extra.label || 'Throughout Guide'),
          description: `[pricing-grid:throughout_guide] ${kind}`,
          quantity: 1,
          unit_cost: Number(extra.amountEur) || 0,
          total_cost: Number(extra.amountEur) || 0,
          is_included: true,
        })
      }

      dayPayload.push({
        day_number: day.dayNumber,
        date: dayDate,
        title: day.title || `Day ${day.dayNumber}`,
        description: day.description || '',
        city: day.city || '',
        overnight_city: overnightByDay.get(day.dayNumber) ?? null,
        // The day's type and its per-part overrides (NULL = the type's
        // default). The grid's reload and completeness gate read these back;
        // they were never stored, so every reload reset every day to "tour".
        ...gridDayComponents(day),
        services,
      })
    }

    const { data: saved, error: saveError } = await supabase
      .rpc('save_pricing_grid_days', { p_itinerary_id: itineraryId, p_days: dayPayload as unknown as Json })

    if (saveError) {
      console.error('[pricing-grid/save] saving days:', saveError.message)
      // A NEW itinerary's header was created just above; without its days it
      // is an empty shell, so it goes too. A re-saved itinerary keeps its
      // previous days — the transaction rolled back.
      if (!config.itineraryId) {
        const { error: cleanupError } = await supabase.from('itineraries').delete().eq('id', itineraryId)
        if (cleanupError) console.error('[pricing-grid/save] removing the empty itinerary:', cleanupError.message)
      }
      return NextResponse.json(
        {
          success: false,
          error: config.itineraryId
            ? 'Could not save the itinerary days — nothing was changed'
            : 'Could not save the itinerary days — nothing was saved',
        },
        { status: 500 }
      )
    }

    const savedRow = Array.isArray(saved) ? saved[0] : saved
    const daysCreated: number = savedRow?.days_inserted ?? dayPayload.length
    const servicesCreated: number = savedRow?.services_inserted ?? 0

    // 4. B2B: the quote is made by /api/b2b/quote-from-itinerary, which the
    // grid calls next with its multi-size rate sheet (b2b-rate-sheet.ts). This
    // route used to make one too, so a save with a partner left two quotes.
    let quoteId: string | undefined
    let quoteNumber: string | undefined
    let redirectUrl: string | undefined

    // 5. B2C: the commercial-offer wrapper.
    // The priced itinerary is the trip; the b2c_quotes row is the offer with
    // the sales lifecycle (quote number, sent/viewed, versioning) and the
    // anchor bookings convert from (one booking per quote, migration 256).
    // A re-save REPRICES the itinerary's open quote (lib/pricing/
    // grid-quote-sync.ts) — it used to add a new draft every time, leaving
    // the quote the operator was working from at the old price.
    let quoteAction: 'created' | 'updated' | undefined
    let previousSellingTotal: number | null = null
    const openQuote = config.clientType === 'b2c' && config.itineraryId
      ? await findOpenGridQuote(supabase, itineraryId).catch(err => {
          console.error('B2C quote lookup error:', err instanceof Error ? err.message : err)
          return null
        })
      : null
    if (openQuote) {
      const { data: updated, error: updateError } = await supabase
        .from('b2c_quotes')
        .update({
          ...quotePriceFields({
            pax, tier: config.tier || 'standard', currency: config.currency || 'EUR',
            supplierTotal: finalSupplierTotal, sellingTotal: finalSellingTotal, marginPercent: marginPct,
          }),
          ...(linkedClientId ? { client_id: linkedClientId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', openQuote.id)
        .select('id')
        .maybeSingle()
      if (updateError || !updated) {
        console.error('B2C quote update error:', updateError?.message ?? 'not visible')
      } else {
        quoteId = openQuote.id
        quoteNumber = openQuote.quote_number
        quoteAction = 'updated'
        previousSellingTotal = openQuote.selling_price
        redirectUrl = `/quotes/b2c/${openQuote.id}`
        // The same version snapshot the quote editor records. The quote id
        // came from the caller's own (RLS) read and update just above.
        try {
          await createAdminClient().rpc('create_b2c_quote_version', {
            p_quote_id: openQuote.id,
            p_changed_by: authResult.user!.id,
            p_change_reason: 'Repriced from the Pricing Grid',
          })
        } catch (versionError) {
          console.error('Error creating quote version:', versionError instanceof Error ? versionError.message : versionError)
        }
      }
    } else if (config.clientType === 'b2c') {
      try {
        const adminClient = createAdminClient()
        const { data: quoteNum } = await adminClient.rpc('generate_b2c_quote_number')

        const { data: quote, error: quoteError } = await supabase
          .from('b2c_quotes')
          .insert({
            tenant_id,
            itinerary_id: itineraryId,
            client_id: linkedClientId,
            // Attribution (mig 269): the staff member saving the quote.
            created_by: authResult.user!.id,
            quote_number: quoteNum || `B2C-${Date.now()}`,
            num_travelers: pax,
            tier: config.tier,
            currency: config.currency || 'EUR',
            status: 'draft',
            total_cost: finalSupplierTotal,
            // The SAME resolved value the price was computed from above.
      // `config.marginPercent || 25` stored 25 for an at-cost grid whose
      // price had been calculated at 0 — the record then disagreed with
      // its own total.
      margin_percent: marginPct,
            selling_price: finalSellingTotal,
            price_per_person: round2(finalSellingTotal / pax),
            internal_notes: 'Created via Pricing Grid',
          })
          .select()
          .single()

        if (!quoteError && quote) {
          quoteId = quote.id
          quoteNumber = quote.quote_number
          quoteAction = 'created'
          redirectUrl = `/quotes/b2c/${quote.id}`
        } else if (quoteError) {
          console.error('B2C quote creation error:', quoteError.message)
        }
      } catch (b2cError) {
        console.error('B2C quote creation error:', b2cError instanceof Error ? b2cError.message : b2cError)
        // Non-fatal: itinerary was still saved
      }
    }

    return NextResponse.json({
      success: true,
      itineraryId,
      // A re-save keeps the itinerary's own code.
      itineraryCode: itinerary.itinerary_code ?? itineraryCode,
      daysCreated,
      servicesCreated,
      quoteId,
      quoteNumber,
      quoteAction,
      previousSellingTotal,
      sellingTotal: finalSellingTotal,
      clientId: linkedClientId,
      clientLinkedBy: clientLink.how,
      redirectUrl: redirectUrl || `/itineraries/${itineraryId}`,
    })

  } catch (error: any) {
    console.error('Pricing grid save error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Save failed' },
      { status: 500 }
    )
  }
}

function getServiceType(slotId: string): string {
  const map: Record<string, string> = {
    route: 'transportation',
    guide: 'guide',
    airport_services: 'transfer',
    hotel_services: 'other',
    tipping: 'tip',
    boat_rides: 'other',
    other_group: 'other',
    accommodation: 'accommodation',
    entrance_fees: 'entrance_fee',
    flights: 'flight',
    experiences: 'other',
    meals: 'meal',
    water: 'other',
    cruise: 'accommodation',
    sleeping_trains: 'transportation',
    other_pp: 'other',
  }
  return map[slotId] || 'other'
}
