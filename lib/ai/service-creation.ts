import { resolveEntranceRate } from '@/lib/pricing/entrance-rate'
import type { ServiceTier } from './parsing-utils'
import { getCruiseRate } from './cruise-pricing'
import { tipLinesForTour, type TippingRow, type DayOccasions, type TipLine } from '@/lib/pricing/tipping'

export async function createLandItineraryServices(
  supabase: any,
  params: {
    tenantId: string;
    days: any[]; itineraryId: string; startDateObj: Date; durationDays: number;
    effectiveCity: string; totalPax: number; isEuroPassport: boolean; skipPricing: boolean;
    withMargin: (cost: number) => number; tier: ServiceTier; finalLanguage: string;
    includeLunch: boolean; includeDinner: boolean; includeAccommodationFinal: boolean;
    guidePerDay: number; selectedGuide: any;
    /** day number → that NIGHT's hotel, from the agency's Rates → Hotels: the
     *  night's own city, tier and date (hotelNightsForGeneratedDays says which
     *  nights). Per person in a double; an odd traveller pays the single
     *  supplement. The route refuses to price when a night has no rate. */
    hotelByDay: Record<number, { ppd: number; singleSupplement: number; hotelName: string; rateId: string }>;
    airportServiceRates: { arrival: number; departure: number }; hotelServiceRate: number; lunchRate: number; dinnerRate: number;
    /** The agency's active tipping rows, in the run's currency — priced by the
     *  SAME rules as the tour engine (lib/pricing/tipping.ts). */
    tippingRows: TippingRow[]; allEntranceFees: any[] | null | undefined;
    /** day number → that day's transport, from the agency's Rates →
     *  Transportation (lib/ai/day-transport.ts decides WHAT each day needs, by
     *  the tour engine's own rule). The route refuses to price when a needed
     *  rate is missing, so every day that needs transport has an entry. */
    transportByDay: Record<number, { rate: number; label: string; vehicleType: string; rateId: string }>;
  }
): Promise<{ totalSupplierCost: number; totalClientPrice: number }> {
  const {
    tenantId,
    days, itineraryId, startDateObj, durationDays,
    effectiveCity, totalPax, isEuroPassport, skipPricing,
    withMargin, tier, finalLanguage,
    includeLunch, includeDinner, includeAccommodationFinal,
    guidePerDay, selectedGuide,
    hotelByDay,
    airportServiceRates, hotelServiceRate, lunchRate, dinnerRate,
    tippingRows, allEntranceFees, transportByDay,
  } = params

  // Create days and services
  let totalSupplierCost = 0
  let totalClientPrice = 0

  // ----- TIPS: every row whose occasion happens (lib/pricing/tipping.ts) -----
  // This used to add ONE number — the sum of the Per Day rows, scaled by tier
  // and rounded — to every guided day. Now the generator and the tour engine
  // read one rule: each tipping row is charged when its context happens on
  // the day, counted by its unit; no tier scaling; never a gap.
  // A sailing needs the whole trip in view, so the days are read up front.
  const tipsByDay = new Map<number, TipLine[]>()
  if (!skipPricing) {
    for (const tip of tipLinesForTour(tippingRows ?? [], (days || []).map(d => tipOccasionsForGeneratedDay(d, params))).lines) {
      tipsByDay.set(tip.day, [...(tipsByDay.get(tip.day) ?? []), tip])
    }
  }
  const tipServices = (dayNumber: number) => (tipsByDay.get(dayNumber) ?? []).map(tip => {
    const each = tip.amount * tip.quantity
    const total = tip.perPerson ? each * totalPax : each
    totalSupplierCost += total
    totalClientPrice += withMargin(total)
    return {
      service_type: 'tips',
      service_code: 'TIPS',
      service_name: tipName(tip),
      quantity: tip.perPerson ? totalPax : tip.quantity,
      rate_eur: tip.perPerson ? each : tip.amount,
      rate_non_eur: tip.perPerson ? each : tip.amount,
      total_cost: total,
      client_price: withMargin(total),
      notes: tip.perPerson ? 'Per traveller' : tip.quantity > 1 ? `${tip.quantity} × ${tip.amount}` : 'For the group',
    }
  })

  for (const dayData of days || []) {
    const dayNumber = dayData.day_number || 1
    const dayDate = new Date(startDateObj)
    dayDate.setDate(startDateObj.getDate() + dayNumber - 1)

    const isLastDay = dayNumber === durationDays
    const isTransferOnly = dayData.is_transfer_only || false
    const isSailingDay = dayData.is_sailing_day || false
    const isFreeDay = dayData.is_free_day || isSailingDay || false
    const isCruiseDay = dayData.is_cruise_day || dayData.accommodation_type === 'cruise'
    const dayNeedsGuide = dayData.guide_required !== false && !isTransferOnly && !isFreeDay
    const dayIncludesLunch = isFreeDay ? false : (dayData.includes_lunch ?? includeLunch)
    const dayIncludesDinner = dayData.includes_dinner ?? includeDinner
    const includesHotelForDay = !isLastDay && includeAccommodationFinal && !isCruiseDay && (dayData.includes_hotel !== false)

    // Generate appropriate title for free/sailing days
    let dayTitle = dayData.title || `Day ${dayNumber}`
    if (isSailingDay && !dayTitle.toLowerCase().includes('sailing')) {
      dayTitle = `Day ${dayNumber}: Sailing Day on the Nile`
    } else if (isFreeDay && !isSailingDay && !dayTitle.toLowerCase().includes('free') && !dayTitle.toLowerCase().includes('leisure')) {
      dayTitle = `Day ${dayNumber}: Day at Leisure`
    }

    // Determine accommodation type for this day
    const dayAccommodationType = isCruiseDay ? (isLastDay ? 'none' : 'cruise') : (includesHotelForDay ? 'hotel' : 'none')

    // Determine overnight display — show cruise name for cruise days
    let overnightCity = dayData.overnight_city || dayData.city || effectiveCity
    if (isCruiseDay && !isLastDay) {
      overnightCity = `On board - ${dayData.city || effectiveCity}`
    }

    // Create day record
    const { data: day, error: dayError } = await supabase
      .from('itinerary_days')
      .insert({
        itinerary_id: itineraryId,
        day_number: dayNumber,
        date: dayDate.toISOString().split('T')[0],
        title: dayTitle,
        description: dayData.description || '',
        city: dayData.city || effectiveCity,
        overnight_city: overnightCity,
        accommodation_type: dayAccommodationType,
        is_cruise_day: isCruiseDay,
        is_sailing_day: isSailingDay,
        is_transfer_only: isTransferOnly,
        attractions: dayData.attractions || [],
        guide_required: dayNeedsGuide,
        lunch_included: dayIncludesLunch,
        dinner_included: dayIncludesDinner,
        hotel_included: includesHotelForDay
      })
      .select()
      .single()

    if (dayError) {
      console.error(`❌ Error creating day ${dayNumber}:`, dayError)
      continue
    }

    if (skipPricing) continue

    // Handle departure day - only transfer
    if (dayData.is_departure && isTransferOnly) {
      // The agency's airport transfer rate. This was half the day rate of a
      // fleet vehicle — a figure on nobody's rate sheet.
      const transferCost = transportByDay[dayNumber]?.rate
      if (!(transferCost > 0)) {
        // Unreachable through the route (it withholds pricing first). Write
        // no line rather than a made-up one.
        console.error(`[service-creation] day ${dayNumber}: no airport transfer rate — transfer line not written`)
        continue
      }
      await supabase.from('itinerary_services').insert({
        itinerary_day_id: day.id,
        service_type: 'transportation',
        service_code: 'TRANSFER',
        service_name: 'Airport Transfer',
        quantity: 1,
        rate_eur: transferCost,
        rate_non_eur: transferCost,
        total_cost: transferCost,
        client_price: withMargin(transferCost),
        notes: 'Transfer to airport'
      })
      totalSupplierCost += transferCost
      totalClientPrice += withMargin(transferCost)
      for (const svc of tipServices(dayNumber)) {
        await supabase.from('itinerary_services').insert({ itinerary_day_id: day.id, ...svc })
      }
      continue
    }

    // Services array
    const services: any[] = []

    // Airport Services (for arrivals/departures/domestic flights)
    //
    // One occurrence per qualifying day — an itinerary that leaves a city and
    // comes back is charged each time, which is why this sits inside the day
    // loop rather than being applied once per trip.
    if (dayData.needs_airport_service || dayData.is_arrival || dayData.is_departure || dayData.flight_info) {
      const isInternational = dayData.is_arrival || dayData.is_departure
      const serviceDesc = isInternational ? 'Airport Meet & Assist (International)' : 'Airport Meet & Assist (Domestic)'

      // Arrival days use the arrival rate; everything else is a departure from
      // this airport. Domestic legs are priced at the itinerary's airport —
      // per-leg airport resolution is not modelled, so a multi-city routing
      // uses the primary airport's rate for its internal flights.
      const dayRate = dayData.is_arrival
        ? airportServiceRates.arrival
        : airportServiceRates.departure

      services.push({
        service_type: 'airport_service',
        service_code: 'AIRPORT',
        service_name: serviceDesc,
        quantity: 1,
        rate_eur: dayRate,
        rate_non_eur: dayRate,
        total_cost: dayRate,
        client_price: withMargin(dayRate),
        notes: dayData.flight_info ? `Flight: ${dayData.flight_info}` : 'Airport assistance'
      })
      totalSupplierCost += dayRate
      totalClientPrice += withMargin(dayRate)
    }

    // Hotel Services (for check-in/check-out including cruise)
    if (dayData.needs_hotel_service && !isFreeDay) {
      const isCruiseService = dayData.accommodation_type === 'cruise' || dayData.is_cruise_day
      services.push({
        service_type: 'hotel_service',
        service_code: 'HOTEL-SVC',
        service_name: isCruiseService ? 'Cruise Boarding Assistance' : 'Hotel Porterage & Assistance',
        quantity: 1,
        rate_eur: hotelServiceRate,
        rate_non_eur: hotelServiceRate,
        total_cost: hotelServiceRate,
        client_price: withMargin(hotelServiceRate),
        notes: isCruiseService ? 'Cruise embarkation/disembarkation assistance' : 'Hotel check-in/out assistance'
      })
      totalSupplierCost += hotelServiceRate
      totalClientPrice += withMargin(hotelServiceRate)
    }

    // Transportation — what the day NEEDS (an airport transfer, a road move to
    // another city, or a day tour), at the agency's own rate for it. It was
    // the day rate of a fleet vehicle, on every non-free day alike.
    const dayTransport = transportByDay[dayNumber]
    if (!isFreeDay && dayTransport && dayTransport.rate > 0) {
      services.push({
        service_type: 'transportation',
        service_code: dayTransport.rateId || 'TRANS',
        service_name: isTransferOnly ? 'Airport/Hotel Transfer' : dayTransport.label,
        supplier_name: null,
        quantity: 1,
        rate_eur: dayTransport.rate,
        rate_non_eur: dayTransport.rate,
        total_cost: dayTransport.rate,
        client_price: withMargin(dayTransport.rate),
        notes: `${dayTransport.vehicleType} — ${dayData.city || effectiveCity}`
      })
      totalSupplierCost += dayTransport.rate
      totalClientPrice += withMargin(dayTransport.rate)
    }

    // Guide (only if required for this day)
    if (dayNeedsGuide) {
      services.push({
        service_type: 'guide',
        service_code: selectedGuide?.id || 'GUIDE',
        service_name: `${finalLanguage} Speaking Guide`,
        supplier_name: selectedGuide?.name || null,
        quantity: 1,
        rate_eur: guidePerDay,
        rate_non_eur: guidePerDay,
        total_cost: guidePerDay,
        client_price: withMargin(guidePerDay),
        notes: `Professional ${finalLanguage} guide`
      })
      totalSupplierCost += guidePerDay
      totalClientPrice += withMargin(guidePerDay)

    }

    // Entrance fees (ONLY for INSIDE attractions, not OUTSIDE photo stops)
    const entranceAttractions = dayData.entrance_included || dayData.attractions || []
    const photoStops = dayData.photo_stops || []

    if (entranceAttractions.length > 0 && !isTransferOnly && !isFreeDay) {
      let dayEntranceTotal = 0
      const matchedAttractions: string[] = []

      for (const attr of entranceAttractions) {
        // Skip if this attraction is in photo_stops (OUTSIDE)
        if (photoStops.some((ps: string) => ps.toLowerCase() === attr.toLowerCase())) {
          continue
        }

        const fee = allEntranceFees?.find((ef: any) =>
          ef.attraction_name.toLowerCase().includes(attr.toLowerCase()) ||
          attr.toLowerCase().includes(ef.attraction_name.toLowerCase())
        )

        if (fee) {
          // Check if it's an add-on (should be excluded from automatic pricing)
          if (fee.is_addon) continue

          // An unpriced attraction is skipped, not charged at 0. It is also
          // left out of matchedAttractions so it is not reported as priced.
          const feePerPerson = resolveEntranceRate(fee, isEuroPassport)
          if (feePerPerson === null) continue
          dayEntranceTotal += feePerPerson * totalPax
          matchedAttractions.push(fee.attraction_name)
        }
      }

      if (dayEntranceTotal > 0) {
        const notesText = photoStops.length > 0
          ? `Inside: ${matchedAttractions.join(', ')} | Photo stops: ${photoStops.join(', ')}`
          : `Sites: ${matchedAttractions.join(', ')}`

        services.push({
          service_type: 'entrance',
          service_code: 'ENTRANCE',
          service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'})`,
          quantity: totalPax,
          rate_eur: dayEntranceTotal / totalPax,
          rate_non_eur: dayEntranceTotal / totalPax,
          total_cost: dayEntranceTotal,
          client_price: withMargin(dayEntranceTotal),
          notes: notesText
        })
        totalSupplierCost += dayEntranceTotal
        totalClientPrice += withMargin(dayEntranceTotal)
      }
    }

    // Lunch (only if included for this day)
    if (dayIncludesLunch) {
      const lunchCost = lunchRate * totalPax
      services.push({
        service_type: 'meal',
        service_code: 'LUNCH',
        service_name: 'Lunch',
        quantity: totalPax,
        rate_eur: lunchRate,
        rate_non_eur: lunchRate,
        total_cost: lunchCost,
        client_price: withMargin(lunchCost),
        notes: 'Lunch at local restaurant'
      })
      totalSupplierCost += lunchCost
      totalClientPrice += withMargin(lunchCost)
    }

    // Dinner (only if included for this day)
    if (dayIncludesDinner) {
      const dinnerCost = dinnerRate * totalPax
      services.push({
        service_type: 'meal',
        service_code: 'DINNER',
        service_name: 'Dinner',
        quantity: totalPax,
        rate_eur: dinnerRate,
        rate_non_eur: dinnerRate,
        total_cost: dinnerCost,
        client_price: withMargin(dinnerCost),
        notes: 'Dinner'
      })
      totalSupplierCost += dinnerCost
      totalClientPrice += withMargin(dinnerCost)
    }

     // Water (for touring days only)
    if (!isTransferOnly && !isFreeDay) {
      const waterCost = 2 * totalPax
      services.push({
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: 2,
        rate_non_eur: 2,
        total_cost: waterCost,
        client_price: withMargin(waterCost),
        notes: 'Bottled water'
      })
      totalSupplierCost += waterCost
      totalClientPrice += withMargin(waterCost)
    }

    // Hotel (only if included and not last day and not cruise day) — THIS
    // night's hotel, in THIS night's city, at the rate for THIS date. It was
    // one hotel for the whole trip, looked up in the itinerary's first city
    // (a Luxor night was priced at the Cairo hotel), from a contacts table no
    // agency has data in, as rooms at a flat double rate.
    const night = hotelByDay[dayNumber]
    if (includesHotelForDay && night && night.ppd > 0) {
      // Per person sharing a double; the odd traveller has a room alone.
      const single = totalPax % 2 === 1 ? night.singleSupplement : 0
      const hotelCost = Math.round((night.ppd * totalPax + single) * 100) / 100
      services.push({
        service_type: 'accommodation',
        service_code: night.rateId || 'HOTEL',
        service_name: night.hotelName,
        supplier_name: night.hotelName,
        quantity: totalPax,
        rate_eur: night.ppd,
        rate_non_eur: night.ppd,
        total_cost: hotelCost,
        client_price: withMargin(hotelCost),
        notes: `Overnight at ${night.hotelName} — per person in a double${single > 0 ? `, plus one single supplement (${single})` : ''}`
      })
      totalSupplierCost += hotelCost
      totalClientPrice += withMargin(hotelCost)
    }

    // Cruise accommodation (for cruise days)
    if (isCruiseDay && !isLastDay) {
      const cruiseRate = await getCruiseRate({ tenantId, tier, travelDate: startDateObj.toISOString().split('T')[0] })
      const nightCost = cruiseRate.perPersonPerNight * totalPax
      services.push({
        service_type: 'cruise',
        service_code: cruiseRate.supplierId || 'CRUISE',
        service_name: `${cruiseRate.shipName} - Full Board`,
        supplier_name: cruiseRate.shipName,
        quantity: totalPax,
        rate_eur: cruiseRate.perPersonPerNight,
        rate_non_eur: cruiseRate.perPersonPerNight,
        total_cost: nightCost,
        client_price: withMargin(nightCost),
        notes: `Night ${dayNumber}: On board`
      })
      totalSupplierCost += nightCost
      totalClientPrice += withMargin(nightCost)
    }

    // Tips for whatever this day turned out to include.
    services.push(...tipServices(dayNumber))

    // Insert all services
    for (const svc of services) {
      await supabase.from('itinerary_services').insert({
        itinerary_day_id: day.id,
        ...svc
      })
    }
  }

  return { totalSupplierCost, totalClientPrice }
}

/** "Driver tip — Day Tour". */
function tipName(tip: TipLine): string {
  const words = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const role = tip.role ? `${words(tip.role)} tip` : 'Tip'
  return tip.context ? `${role} — ${words(tip.context)}` : role
}

/**
 * What a GENERATED day includes that a tip can be for — read with the same
 * conditions the loop above uses to create each service, so a tip is charged
 * exactly when the thing it is for is.
 */
export function tipOccasionsForGeneratedDay(
  dayData: any,
  p: { durationDays: number; effectiveCity: string; includeLunch: boolean; includeDinner: boolean; includeAccommodationFinal: boolean }
): DayOccasions {
  const dayNumber = dayData.day_number || 1
  const isLastDay = dayNumber === p.durationDays
  const isTransferOnly = dayData.is_transfer_only || false
  const isSailingDay = dayData.is_sailing_day || false
  const isFreeDay = dayData.is_free_day || isSailingDay || false
  const isCruiseDay = dayData.is_cruise_day || dayData.accommodation_type === 'cruise'
  const departureTransferOnly = !!dayData.is_departure && isTransferOnly
  const dayNeedsGuide = dayData.guide_required !== false && !isTransferOnly && !isFreeDay
  const lunch = isFreeDay ? false : (dayData.includes_lunch ?? p.includeLunch)
  const dinner = dayData.includes_dinner ?? p.includeDinner
  const hotelNight = !isLastDay && p.includeAccommodationFinal && !isCruiseDay && (dayData.includes_hotel !== false)
  return {
    day: dayNumber,
    city: dayData.city || p.effectiveCity,
    // The generator has no half-day: a guided day is a day tour.
    sightseeing: dayNeedsGuide && !departureTransferOnly ? 'full' : null,
    // A departure transfer-only day creates its transfer and nothing else.
    restaurantMeals: departureTransferOnly ? 0 : (lunch ? 1 : 0) + (dinner ? 1 : 0),
    transfers: isTransferOnly ? 1 : 0,
    airportServices: !departureTransferOnly && (dayData.needs_airport_service || dayData.is_arrival || dayData.is_departure || dayData.flight_info) ? 1 : 0,
    hotelServices: !departureTransferOnly && dayData.needs_hotel_service && !isFreeDay ? 1 : 0,
    night: departureTransferOnly ? null : isCruiseDay ? (isLastDay ? null : 'cruise') : hotelNight ? 'hotel' : null,
  }
}

/** The nights a generated itinerary sleeps in a hotel, and where — read with
 *  the same conditions the loop above uses to write the accommodation line. */
export function hotelNightsForGeneratedDays(
  days: ReadonlyArray<{ day_number?: number; city?: string | null; overnight_city?: string | null; is_cruise_day?: boolean; accommodation_type?: string | null; includes_hotel?: boolean }> | null | undefined,
  p: { durationDays: number; effectiveCity: string; includeAccommodationFinal: boolean }
): Array<{ day: number; city: string }> {
  if (!p.includeAccommodationFinal) return []
  return (days ?? []).flatMap(d => {
    const day = d.day_number || 1
    const onShip = d.is_cruise_day || d.accommodation_type === 'cruise'
    if (day === p.durationDays || onShip || d.includes_hotel === false) return []
    return [{ day, city: String(d.overnight_city || d.city || p.effectiveCity || '').trim() }]
  })
}

/** The days a generated itinerary needs a guide on — the loop's own condition. */
export function guidedDaysOfGeneratedItinerary(
  days: ReadonlyArray<{ day_number?: number; guide_required?: boolean; is_transfer_only?: boolean; is_free_day?: boolean; is_sailing_day?: boolean }> | null | undefined
): number[] {
  return (days ?? [])
    .filter(d => d.guide_required !== false && !d.is_transfer_only && !(d.is_free_day || d.is_sailing_day))
    .map(d => d.day_number || 1)
}
