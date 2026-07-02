import { toNumber } from './parsing-utils'
import type { ServiceTier } from './parsing-utils'
import { getCruiseRate } from './cruise-pricing'

export async function createLandItineraryServices(
  supabase: any,
  params: {
    days: any[]; itineraryId: string; startDateObj: Date; durationDays: number;
    effectiveCity: string; totalPax: number; isEuroPassport: boolean; skipPricing: boolean;
    withMargin: (cost: number) => number; tier: ServiceTier; finalLanguage: string;
    includeLunch: boolean; includeDinner: boolean; includeAccommodationFinal: boolean;
    vehiclePerDay: number; guidePerDay: number; selectedVehicle: any; selectedGuide: any;
    selectedHotel: any; hotelRate: number; hotelName_final: string; roomsNeeded: number;
    airportServiceRate: number; hotelServiceRate: number; lunchRate: number; dinnerRate: number;
    dailyTips: number; allEntranceFees: any[] | null | undefined;
  }
): Promise<{ totalSupplierCost: number; totalClientPrice: number }> {
  const {
    days, itineraryId, startDateObj, durationDays,
    effectiveCity, totalPax, isEuroPassport, skipPricing,
    withMargin, tier, finalLanguage,
    includeLunch, includeDinner, includeAccommodationFinal,
    vehiclePerDay, guidePerDay, selectedVehicle, selectedGuide,
    selectedHotel, hotelRate, hotelName_final, roomsNeeded,
    airportServiceRate, hotelServiceRate, lunchRate, dinnerRate,
    dailyTips, allEntranceFees,
  } = params

  // Create days and services
  let totalSupplierCost = 0
  let totalClientPrice = 0

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
      const transferCost = vehiclePerDay * 0.5
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
      continue
    }

    // Services array
    const services: any[] = []

    // Airport Services (for arrivals/departures/domestic flights)
    if (dayData.needs_airport_service || dayData.is_arrival || dayData.is_departure || dayData.flight_info) {
      const isInternational = dayData.is_arrival || dayData.is_departure
      const serviceDesc = isInternational ? 'Airport Meet & Assist (International)' : 'Airport Meet & Assist (Domestic)'

      services.push({
        service_type: 'airport_service',
        service_code: 'AIRPORT',
        service_name: serviceDesc,
        quantity: 1,
        rate_eur: airportServiceRate,
        rate_non_eur: airportServiceRate,
        total_cost: airportServiceRate,
        client_price: withMargin(airportServiceRate),
        notes: dayData.flight_info ? `Flight: ${dayData.flight_info}` : 'Airport assistance'
      })
      totalSupplierCost += airportServiceRate
      totalClientPrice += withMargin(airportServiceRate)
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

    // Transportation (always included unless it's a free day)
    if (!isFreeDay) {
      const transportRate = isTransferOnly ? vehiclePerDay * 0.5 : vehiclePerDay
      services.push({
        service_type: 'transportation',
        service_code: selectedVehicle?.id || 'TRANS',
        service_name: isTransferOnly ? 'Airport/Hotel Transfer' : `${selectedVehicle?.vehicle_type || 'Vehicle'} Transportation`,
        supplier_name: selectedVehicle?.company_name || null,
        quantity: 1,
        rate_eur: transportRate,
        rate_non_eur: transportRate,
        total_cost: transportRate,
        client_price: withMargin(transportRate),
        notes: `From ${dayData.city || effectiveCity}`
      })
      totalSupplierCost += transportRate
      totalClientPrice += withMargin(transportRate)
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

     // Tips (only when guide is present)
     services.push({
      service_type: 'tips',
      service_code: 'TIPS',
      service_name: 'Daily Tips',
      quantity: 1,
      rate_eur: dailyTips,
      rate_non_eur: dailyTips,
      total_cost: dailyTips,
      client_price: withMargin(dailyTips),
      notes: 'Driver and guide tips'
    })
    totalSupplierCost += dailyTips
    totalClientPrice += withMargin(dailyTips)
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

          const feePerPerson = isEuroPassport
            ? toNumber(fee.eur_rate, 0)
            : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
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

    // Hotel (only if included and not last day and not cruise day)
    if (includesHotelForDay && hotelRate > 0) {
      const hotelCost = hotelRate * roomsNeeded
      services.push({
        service_type: 'accommodation',
        service_code: selectedHotel?.id || 'HOTEL',
        service_name: `${hotelName_final} (${roomsNeeded} room${roomsNeeded > 1 ? 's' : ''})`,
        supplier_name: hotelName_final,
        quantity: roomsNeeded,
        rate_eur: hotelRate,
        rate_non_eur: hotelRate,
        total_cost: hotelCost,
        client_price: withMargin(hotelCost),
        notes: `Overnight at ${hotelName_final}`
      })
      totalSupplierCost += hotelCost
      totalClientPrice += withMargin(hotelCost)
    }

    // Cruise accommodation (for cruise days)
    if (isCruiseDay && !isLastDay) {
      const cruiseRate = await getCruiseRate(tier, [], supabase)
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
