// ============================================
// POST /api/pricing-grid/save
// Save grid to itinerary + services (B2C/B2B)
// ============================================
//
// Pricing parity note: per-service costs are derived from the grid's
// passport-aware `selectedItems` (rateEur / rateNonEur) exactly as in
// travel-ops-pro — group slots charged once, per-person slots × pax, custom
// amounts honoured. The tenant_id / client_id persistence model and the B2B
// quote RPC are the sibling's own and are preserved unchanged.

import { NextRequest, NextResponse } from 'next/server'
import { resolveMarginPercent } from '@/lib/pricing/resolve-margin'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import type { TablesInsert } from '@/types/database.types'

function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `ITN-S-${year}-${random}`
}

// Group slots are charged once for the whole group; per-person slots scale by pax.
const GRID_GROUP_SLOTS = ['route', 'guide', 'airport_services', 'hotel_services', 'tipping', 'boat_rides', 'other_group']

// Passport-aware rate for one selected item (mirrors calculator.ts getRate).
function itemRate(item: any, passport: string): number {
  return passport === 'eu' ? (Number(item.rateEur) || 0) : (Number(item.rateNonEur) || 0)
}

// Supplier (cost) total for one slot under the given passport, before margin.
function slotSupplierCost(slot: any, passport: string, pax: number): number {
  const isGroup = GRID_GROUP_SLOTS.includes(slot.slotId)
  if (slot.customAmount && slot.customAmount > 0) {
    return isGroup ? slot.customAmount : slot.customAmount * pax
  }
  let line = 0
  for (const item of (slot.selectedItems || [])) {
    const rate = itemRate(item, passport)
    line += isGroup ? rate : rate * pax
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

    if (!config || !days || !totals) {
      return NextResponse.json({ success: false, error: 'Missing config, days, or totals' }, { status: 400 })
    }

    const pax = Math.max(config.pax || 1, 1)
    const passport = config.passport || 'non_eu'
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
        return dsum + slotSupplierCost(slot, passport, pax)
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

    // 1. Create/update itinerary record
    const itineraryData: TablesInsert<'itineraries'> = {
      tenant_id,
      itinerary_code: itineraryCode,
      client_id: config.clientId || null,
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
      package_type: 'land-package',
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
      // Update existing
      const { data, error } = await supabase
        .from('itineraries')
        .update(itineraryData)
        .eq('id', config.itineraryId)
        .select()
        .single()
      if (error) throw error
      itinerary = data

      // Delete old days and services — CHECKED, because the replacements are
      // inserted immediately below. A silent failure here leaves the old days
      // in place alongside the new ones and the itinerary silently doubles.
      const { error: daysErr } = await supabase
        .from('itinerary_days').delete().eq('itinerary_id', config.itineraryId)
      if (daysErr) {
        console.error('[pricing-grid/save] clearing old days:', daysErr.message)
        return NextResponse.json(
          { error: 'Could not clear the existing itinerary days — nothing was saved' },
          { status: 500 }
        )
      }
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

    // 2. Create days
    let daysCreated = 0
    let servicesCreated = 0

    for (const day of days) {
      const dayDate = new Date(new Date(startDate).getTime() + (day.dayNumber - 1) * 86400000)
        .toISOString().split('T')[0]

      const { data: dayRecord, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          tenant_id,
          itinerary_id: itineraryId,
          day_number: day.dayNumber,
          date: dayDate,
          title: day.title || `Day ${day.dayNumber}`,
          description: day.description || '',
          city: day.city || '',
          overnight_city: day.city || '',
        })
        .select()
        .single()

      if (dayError) {
        console.error(`Error creating day ${day.dayNumber}:`, dayError)
        continue
      }
      daysCreated++

      // 3. Create services from non-empty slots. One service row per selected
      //    item (passport-aware rate), plus custom-amount slots. Group slots are
      //    charged once; per-person slots × pax — identical to calculator.ts.
      const services: any[] = []
      for (const slot of day.slots) {
        const hasItems = (slot.selectedItems?.length ?? 0) > 0
        const hasCustom = slot.customAmount && slot.customAmount > 0
        if (!hasItems && !hasCustom) continue

        const isGroup = GRID_GROUP_SLOTS.includes(slot.slotId)
        const serviceType = getServiceType(slot.slotId)

        if (hasCustom) {
          const unit = slot.customAmount
          services.push({
            itinerary_id: itineraryId,
            day_id: dayRecord.id,
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

        for (const item of (slot.selectedItems || [])) {
          const rate = itemRate(item, passport)
          services.push({
            itinerary_id: itineraryId,
            day_id: dayRecord.id,
            service_type: serviceType,
            service_name: item.name || slot.slotId.replace(/_/g, ' '),
            description: `[pricing-grid:${slot.slotId}] ${item.name || ''}`,
            quantity: isGroup ? 1 : pax,
            unit_cost: rate,
            total_cost: isGroup ? rate : rate * pax,
            is_included: true,
          })
        }
      }

      if (services.length > 0) {
        const { error: svcError } = await supabase
          .from('itinerary_services')
          .insert(services)
        if (svcError) {
          console.error(`Error creating services for day ${day.dayNumber}:`, svcError)
        } else {
          servicesCreated += services.length
        }
      }
    }

    // 4. B2B: Create quote if needed
    let quoteId: string | undefined
    let redirectUrl: string | undefined

    if (config.clientType === 'b2b' && config.partnerId) {
      try {
        const adminClient = createAdminClient()
        // Generate quote number via RPC
        const { data: quoteNum } = await adminClient.rpc('generate_b2b_quote_number')

        const { data: quote, error: quoteError } = await supabase
          .from('b2b_quotes')
          .insert({
            tenant_id,
            itinerary_id: itineraryId,
            partner_id: config.partnerId,
            quote_number: quoteNum || `B2B-${Date.now()}`,
            tier: config.tier,
            currency: config.currency || 'EUR',
            status: 'draft',
            pricing_table: [{
              pax,
              cost_per_person: totals.costPerPerson,
              selling_per_person: totals.sellingPricePerPerson,
              total: totals.sellingPriceTotal,
            }],
            internal_notes: `Created via Pricing Grid`,
          })
          .select()
          .single()

        if (!quoteError && quote) {
          quoteId = quote.id
          redirectUrl = `/quotes/b2b/${quote.id}`
        }
      } catch (b2bError: any) {
        console.error('B2B quote creation error:', b2bError.message)
        // Non-fatal: itinerary was still saved
      }
    }

    // 5. B2C: create the commercial-offer wrapper, mirroring the B2B branch.
    // The priced itinerary is the trip; the b2c_quotes row is the offer with
    // the sales lifecycle (quote number, sent/viewed, versioning) and the
    // anchor bookings convert from (one booking per quote, migration 256).
    if (config.clientType === 'b2c') {
      try {
        const adminClient = createAdminClient()
        const { data: quoteNum } = await adminClient.rpc('generate_b2c_quote_number')

        const { data: quote, error: quoteError } = await supabase
          .from('b2c_quotes')
          .insert({
            tenant_id,
            itinerary_id: itineraryId,
            client_id: config.clientId || null,
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
      itineraryCode,
      daysCreated,
      servicesCreated,
      quoteId,
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
