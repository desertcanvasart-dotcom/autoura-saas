import { resolveEntranceRate } from '@/lib/pricing/entrance-rate'

export async function createCruiseItineraryServices(
  supabase: any,
  params: {
    dayByDay: any[]; itineraryId: string; startDateObj: Date; durationDays: number;
    effectiveCity: string; cruiseRate: any; totalPax: number; isEuroPassport: boolean;
    skipPricing: boolean; withMargin: (cost: number) => number;
  }
): Promise<{ totalSupplierCost: number; totalClientPrice: number }> {
  const {
    dayByDay, itineraryId, startDateObj, durationDays,
    effectiveCity, cruiseRate, totalPax, isEuroPassport,
    skipPricing, withMargin,
  } = params

  let totalSupplierCost = 0
  let totalClientPrice = 0

  // Create days from Content Library
  for (const dayData of dayByDay) {
    const dayDate = new Date(startDateObj)
    dayDate.setDate(startDateObj.getDate() + dayData.day_number - 1)

    const isLastCruiseDay = dayData.day_number === durationDays

    const { data: day, error: dayError } = await supabase
      .from('itinerary_days')
      .insert({
        itinerary_id: itineraryId,
        day_number: dayData.day_number,
        date: dayDate.toISOString().split('T')[0],
        title: dayData.title,
        description: dayData.description,
        city: dayData.city || effectiveCity,
        overnight_city: isLastCruiseDay ? (dayData.city || effectiveCity) : (dayData.overnight || `On board ${cruiseRate.shipName}`),
        accommodation_type: isLastCruiseDay ? 'none' : 'cruise',
        is_cruise_day: true,
        is_sailing_day: dayData.is_sailing_day || false,
        attractions: dayData.attractions || [],
        guide_required: true,
        lunch_included: dayData.meals?.includes('lunch') ?? true,
        dinner_included: dayData.meals?.includes('dinner') ?? true,
        hotel_included: false
      })
      .select()
      .single()

    if (dayError) {
      console.error(`❌ Error creating day ${dayData.day_number}:`, dayError)
      continue
    }

    if (skipPricing) continue

    // Add cruise service (per night)
    const isLastDay = dayData.day_number === durationDays
    if (!isLastDay) {
      const nightCost = cruiseRate.perPersonPerNight * totalPax
      const nightClientPrice = withMargin(nightCost)

      await supabase.from('itinerary_services').insert({
        itinerary_day_id: day.id,
        service_type: 'cruise',
        service_code: cruiseRate.supplierId || 'CRUISE',
        service_name: `${cruiseRate.shipName} - Full Board`,
        supplier_name: cruiseRate.shipName,
        quantity: totalPax,
        rate_eur: cruiseRate.perPersonPerNight,
        rate_non_eur: cruiseRate.perPersonPerNight,
        total_cost: nightCost,
        client_price: nightClientPrice,
        notes: `Night ${dayData.day_number}: ${dayData.overnight || 'On board'}`
      })

      totalSupplierCost += nightCost
      totalClientPrice += nightClientPrice
    }

    // Add entrance fees
    if (dayData.attractions?.length > 0) {
      const { data: entranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)

      let dayEntranceTotal = 0
      const matchedAttractions: string[] = []

      for (const attractionName of dayData.attractions) {
        const fee = entranceFees?.find((ef: any) =>
          ef.attraction_name.toLowerCase().includes(attractionName.toLowerCase()) ||
          attractionName.toLowerCase().includes(ef.attraction_name.toLowerCase())
        )

        if (fee) {
          // Unpriced -> skip, never charge 0. See lib/pricing/entrance-rate.ts.
          const feePerPerson = resolveEntranceRate(fee, isEuroPassport)
          if (feePerPerson === null) continue
          dayEntranceTotal += feePerPerson * totalPax
          matchedAttractions.push(fee.attraction_name)
        }
      }

      if (dayEntranceTotal > 0) {
        await supabase.from('itinerary_services').insert({
          itinerary_day_id: day.id,
          service_type: 'entrance',
          service_code: 'ENTRANCE-FEES',
          service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'} rates)`,
          quantity: totalPax,
          rate_eur: dayEntranceTotal / totalPax,
          rate_non_eur: dayEntranceTotal / totalPax,
          total_cost: dayEntranceTotal,
          client_price: withMargin(dayEntranceTotal),
          notes: `Sites: ${matchedAttractions.join(', ')}`
        })

        totalSupplierCost += dayEntranceTotal
        totalClientPrice += withMargin(dayEntranceTotal)
      }
    }
  }

  return { totalSupplierCost, totalClientPrice }
}
