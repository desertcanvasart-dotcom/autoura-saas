// ============================================
// DAY RULES ENGINE — Post-AI Validation Layer
// File: lib/ai/day-rules-engine.ts
//
// Runs AFTER AI generates the itinerary JSON but BEFORE
// service creation. Enforces deterministic business rules
// that the AI may not follow consistently:
//
// 1. Arrival/departure day flags
// 2. Airport & hotel service flags
// 3. Transfer-only day cleanup (no attractions, no guide)
// 4. Attraction cleanup (remove meal venues, duplicates)
//
// This is the safety net that ensures pricing accuracy
// regardless of AI output quality.
// ============================================

/**
 * Known meal venues that should NOT appear in attractions[]
 * (they don't have entrance fees). These are restaurants, markets,
 * or bazaars where tourists go to eat, not to pay an entrance fee.
 */
const MEAL_VENUE_PATTERNS = [
  /fish\s*market/i,
  /khan\s*el[\s-]*khalili\s*(bazaar|market|cafe|restaurant)?$/i,
  /local\s*restaurant/i,
  /nubian\s*(restaurant|café|cafe)/i,
  /sound\s*(&|and)\s*light/i, // Separate ticketed event, priced differently
]

/**
 * Geographic or vague terms the AI sometimes puts in attractions[]
 * that are NOT bookable sites with entrance fees. These should be
 * moved to photo_stops[] or removed entirely.
 */
const NON_ATTRACTION_PATTERNS = [
  /^red\s*sea$/i,              // Geographic body of water, not a ticketed site
  /^nile(\s*river)?$/i,        // Geographic, not a ticketed site
  /^snorkeling\s*(sites?|spots?|areas?)?$/i,  // Part of Sea Trip activity
  /^swimming$/i,
  /^beach$/i,
  /^free\s*(time|day|morning|afternoon)$/i,
  /^leisure$/i,
  /^shopping$/i,
  /^bazaar$/i,
]

/**
 * Activities that are bundled in the cruise transport package.
 * On cruise days, these should NOT appear in attractions[] because
 * they are included in the flat-rate cruise transport (felucca, carriage, motorboat, etc.)
 * On NON-cruise days, these are also not entrance-fee sites — move to photo_stops.
 */
const CRUISE_BUNDLED_ACTIVITIES = [
  /felucca\s*(sail\s*boat\s*)?(ride|trip|sailing)?/i,
  /horse\s*carriage\s*(ride|trip)?/i,
  /carriage\s*ride/i,
  /camel\s*ride/i,
  /motor\s*boat\s*(ride|trip)?/i,
]

/**
 * Detect if a day title/description indicates transfer-only
 * (no real sightseeing, just moving between locations)
 */
const TRANSFER_ONLY_INDICATORS = [
  /^(day\s*\d+[:\s]*)?arrival/i,
  /^(day\s*\d+[:\s]*)?farewell/i,
  /^(day\s*\d+[:\s]*)?departure/i,
  /transfer\s*to\s*(the\s*)?airport/i,
  /airport\s*transfer/i,
  /check[\s-]?out\s*(and|&)\s*transfer/i,
  /check[\s-]?out\s*(and|&)\s*departure/i,
  /end\s*of\s*(tour|trip|services?)/i,
]

/**
 * Detect if a day has real sightseeing based on its title
 * (to distinguish "Arrival with pyramids visit" from "Arrival transfer only")
 */
const SIGHTSEEING_INDICATORS = [
  /visit/i,
  /explore/i,
  /tour\s*(of|to|in)/i,
  /discover/i,
  /excursion/i,
  /day\s*trip/i,
  /sightseeing/i,
  /museum/i,
  /temple/i,
  /pyramid/i,
  /valley/i,
  /citadel/i,
]

/**
 * Apply deterministic business rules to AI-generated day data.
 * Returns a new array with corrected flags and cleaned attractions.
 *
 * This function is PURE — it doesn't mutate the input, doesn't
 * access the database, and has no side effects.
 */
export function applyDayRules(days: any[], packageType: string): any[] {
  if (!days || !Array.isArray(days) || days.length === 0) return days

  const totalDays = days.length
  const isMultiDay = totalDays > 1
  const isFullPackage = ['full-package', 'cruise-package', 'cruise-land'].includes(packageType)

  return days.map((day, index) => {
    const corrected = { ...day }
    const isFirstDay = index === 0
    const isLastDay = index === totalDays - 1
    const dayTitle = (day.title || '').toLowerCase()
    const dayDescription = (day.description || '').toLowerCase()
    const combined = dayTitle + ' ' + dayDescription

    // ============================================
    // RULE 1: First day of multi-day package
    // ============================================
    if (isFirstDay && isMultiDay && isFullPackage) {
      // Always set arrival flags
      corrected.is_arrival = true
      corrected.needs_airport_service = true
      corrected.needs_hotel_service = true

      // Determine if this is truly transfer-only or has sightseeing
      const hasSightseeingInTitle = SIGHTSEEING_INDICATORS.some(p => p.test(combined))
      const hasRealAttractions = (day.attractions || []).length > 0 && hasSightseeingInTitle

      if (!hasRealAttractions) {
        // Pure arrival/transfer day — no sightseeing
        corrected.is_transfer_only = true
        corrected.attractions = []
        corrected.photo_stops = day.photo_stops || []
        corrected.guide_required = false
      }
      // If there IS sightseeing (arrival + day tour), keep attractions
      // but ensure airport service flags are still set
    }

    // ============================================
    // RULE 2: Last day of multi-day package
    // ============================================
    if (isLastDay && isMultiDay && isFullPackage) {
      // Always set departure flags
      corrected.is_departure = true
      corrected.needs_airport_service = true
      corrected.needs_hotel_service = true

      // Detect transfer-only departure
      const isTransferTitle = TRANSFER_ONLY_INDICATORS.some(p => p.test(combined))
      const hasSightseeingInTitle = SIGHTSEEING_INDICATORS.some(p => p.test(combined))
      const hasRealAttractions = (day.attractions || []).length > 0 && hasSightseeingInTitle

      if (isTransferTitle || !hasRealAttractions) {
        corrected.is_transfer_only = true
        corrected.attractions = []
        corrected.photo_stops = day.photo_stops || []
        corrected.guide_required = false
      }
    }

    // ============================================
    // RULE 3: Transfer-only day enforcement
    // ============================================
    if (corrected.is_transfer_only) {
      // Transfer-only days must never have attractions or guide
      corrected.attractions = []
      corrected.guide_required = false
    }

    // ============================================
    // RULE 4: Attraction cleanup — remove meal venues and cruise-bundled activities
    // ============================================
    if (corrected.attractions && corrected.attractions.length > 0) {
      const cleaned: string[] = []
      const removedMealVenues: string[] = []
      const removedCruiseBundled: string[] = []

      const isCruiseDay = corrected.is_cruise_day || corrected.accommodation_type === 'cruise'

      for (const attr of corrected.attractions) {
        const isMealVenue = MEAL_VENUE_PATTERNS.some(p => p.test(attr))
        const isCruiseBundled = CRUISE_BUNDLED_ACTIVITIES.some(p => p.test(attr))
        const isNonAttraction = NON_ATTRACTION_PATTERNS.some(p => p.test(attr))

        if (isNonAttraction) {
          // Geographic/vague terms — not bookable sites, just remove silently
          console.log(`🧹 Day ${day.day_number || index + 1}: "${attr}" is not a bookable attraction — removed from attractions`)
        } else if (isMealVenue) {
          removedMealVenues.push(attr)
          // Move to photo_stops if not already there (no entrance fee, but still mentioned)
          if (!corrected.photo_stops?.some((ps: string) => ps.toLowerCase() === attr.toLowerCase())) {
            corrected.photo_stops = [...(corrected.photo_stops || []), attr]
          }
        } else if (isCruiseBundled) {
          // On cruise days: silently remove (bundled in cruise transport package)
          // On non-cruise days: also remove from attractions (not entrance-fee sites)
          removedCruiseBundled.push(attr)
          if (isCruiseDay) {
            // Don't add to photo_stops on cruise days — it's part of the transport package
            console.log(`🚢 Day ${day.day_number || index + 1}: "${attr}" is bundled in cruise transport — removed from attractions`)
          } else {
            // On non-cruise days, move to photo_stops (it's an activity, not an entrance fee)
            if (!corrected.photo_stops?.some((ps: string) => ps.toLowerCase() === attr.toLowerCase())) {
              corrected.photo_stops = [...(corrected.photo_stops || []), attr]
            }
          }
        } else {
          cleaned.push(attr)
        }
      }

      if (removedMealVenues.length > 0) {
        console.log(`🧹 Day ${day.day_number || index + 1}: Moved meal venues from attractions to photo_stops: ${removedMealVenues.join(', ')}`)
      }

      corrected.attractions = cleaned
    }

    // ============================================
    // RULE 5: Airport + hotel service flag enforcement
    // ============================================
    if (corrected.is_arrival) {
      corrected.needs_airport_service = true
      corrected.needs_hotel_service = true
    }
    if (corrected.is_departure) {
      corrected.needs_airport_service = true
      corrected.needs_hotel_service = true
    }
    // Domestic flights always need airport service
    if (corrected.transport_type === 'flight' && !corrected.is_arrival && !corrected.is_departure) {
      corrected.needs_airport_service = true
    }

    // ============================================
    // RULE 6: Guide not needed on free/sailing days
    // ============================================
    if (corrected.is_free_day || corrected.is_sailing_day) {
      corrected.guide_required = false
      // Free days shouldn't have attractions either
      if (corrected.is_free_day && !corrected.is_sailing_day) {
        corrected.attractions = []
      }
    }

    return corrected
  })
}

/**
 * Apply the same rules to the B2B parseItinerary() output.
 * The B2B path uses a different data structure (ItineraryDay),
 * so this function adapts the rules accordingly.
 *
 * NOTE: ported but NOT wired into the pricing engine (auto-pricing-service)
 * here — kept available for an opt-in B2B wire-in after verification.
 */
export function applyB2BDayRules(days: any[]): any[] {
  if (!days || !Array.isArray(days) || days.length === 0) return days

  const totalDays = days.length

  return days.map((day, index) => {
    const corrected = { ...day }
    const isFirstDay = index === 0
    const isLastDay = index === totalDays - 1

    // Ensure services object exists
    if (!corrected.services) {
      corrected.services = {}
    }

    // First day: force arrival flags
    if (isFirstDay && totalDays > 1) {
      corrected.services = {
        ...corrected.services,
        airport_arrival: true,
        hotel_checkin: true,
      }
    }

    // Last day: force departure flags
    if (isLastDay && totalDays > 1) {
      corrected.services = {
        ...corrected.services,
        airport_departure: true,
        hotel_checkout: true,
      }
    }

    // Transfer-only detection for first/last days
    // If attractions[] is explicitly provided and non-empty, trust it (data from enriched template)
    // Only check title indicators when attractions are empty to decide if it's sightseeing
    const combined = ((day.title || '') + ' ' + (day.description || '')).toLowerCase()
    const attractionsList = corrected.attractions || []
    const hasProvidedAttractions = attractionsList.length > 0
    const titleSuggestsSightseeing = SIGHTSEEING_INDICATORS.some(p => p.test(combined))
    const hasRealSightseeing = hasProvidedAttractions || titleSuggestsSightseeing

    if ((isFirstDay || isLastDay) && !hasRealSightseeing && totalDays > 1) {
      // Transfer-only: clear attractions, no guide needed
      corrected.attractions = []
      corrected.services = {
        ...corrected.services,
        guide_required: false,
      }
    }

    // Clean meal venues from attractions
    if (corrected.attractions && corrected.attractions.length > 0) {
      corrected.attractions = corrected.attractions.filter(
        (attr: string) => !MEAL_VENUE_PATTERNS.some(p => p.test(attr))
      )
    }

    return corrected
  })
}
