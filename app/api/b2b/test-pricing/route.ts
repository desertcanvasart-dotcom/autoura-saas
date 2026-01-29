// ============================================
// TEST ENDPOINT: Day-Based Pricing
// File: app/api/b2b/test-pricing/route.ts
//
// Test the new pricing service with the Nile Cruise tour
// 
// Usage: GET /api/b2b/test-pricing?template_id=xxx&tier=standard
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { 
  calculateDayBasedPricing, 
  calculateAutoPricing,
  formatPricingTable,
  parseItinerary,
  ServiceTier 
} from '@/lib/auto-pricing-service'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase admin client (avoids build-time errors)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // Default to Nile Cruise tour
  const templateId = searchParams.get('template_id') || '04e22e6d-e8f0-4bd9-99f5-6dcb2b1c707a'
  const tier = (searchParams.get('tier') || 'standard') as ServiceTier
  const isEurPassport = searchParams.get('eur') !== 'false'
  const marginPercent = parseFloat(searchParams.get('margin') || '25')
  
  console.log('🧪 Testing day-based pricing:', { templateId, tier, isEurPassport, marginPercent })

  try {
    // ============================================
    // STEP 1: Fetch template info
    // ============================================
    const { data: template, error: templateError } = await supabaseAdmin
      .from('tour_templates')
      .select(`
        id,
        template_name,
        duration_days,
        tour_type,
        category_id,
        itinerary,
        tour_categories (
          id,
          category_name
        )
      `)
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ 
        success: false, 
        error: 'Template not found',
        templateId 
      }, { status: 404 })
    }

    // ============================================
    // STEP 2: Parse itinerary for debugging
    // ============================================
    const parsedItinerary = parseItinerary(template.itinerary)
    
    const itineraryAnalysis = {
      totalDays: parsedItinerary.length,
      hotelNights: parsedItinerary.filter(d => d.accommodation_type === 'hotel').length,
      cruiseNights: parsedItinerary.filter(d => d.accommodation_type === 'cruise').length,
      sightseeingDays: parsedItinerary.filter(d => d.services.guide_required).length,
      totalAttractions: parsedItinerary.reduce((sum, d) => sum + d.attractions.length, 0),
      externalMeals: parsedItinerary.reduce((sum: number, d: any) => {
        let count = 0
        if (d.meals.lunch === 'external') count++
        if (d.meals.dinner === 'external') count++
        return sum + count
      }, 0),
      days: parsedItinerary.map(d => ({
        day: d.day,
        city: d.city,
        accommodation: d.accommodation_type,
        attractions: d.attractions,
        guide: d.services.guide_required,
        airportArrival: d.services.airport_arrival,
        airportDeparture: d.services.airport_departure
      }))
    }

    // ============================================
    // STEP 3: Run the NEW day-based pricing
    // ============================================
    const dayPricingResult = await calculateDayBasedPricing({
      templateId,
      tier,
      isEurPassport,
      language: 'English',
      marginPercent
    })

    // ============================================
    // STEP 4: Format as B2B pricing table
    // ============================================
    const pricingTableRows = formatPricingTable(dayPricingResult)

    // ============================================
    // STEP 5: Also test backward compatibility
    // ============================================
    const legacyResult = await calculateAutoPricing({
      templateId,
      tier,
      numPax: 2,
      isEurPassport,
      language: 'English',
      marginPercent,
      tourLeaderIncluded: false
    })

    // ============================================
    // STEP 6: Return comprehensive test results
    // ============================================
    return NextResponse.json({
      success: true,
      test: 'Day-Based Pricing Service v3',
      timestamp: new Date().toISOString(),
      
      // Template info
      template: {
        id: template.id,
        name: template.template_name,
        duration: template.duration_days,
        theme: (template.tour_categories as any)?.category_name || 'Unknown'
      },
      
      // Itinerary analysis
      itineraryAnalysis,
      
      // Pricing parameters
      params: {
        tier,
        isEurPassport,
        marginPercent
      },
      
      // NEW: Full pricing table
      pricingTable: {
        singleSupplement: dayPricingResult.singleSupplement,
        currency: dayPricingResult.currency,
        rows: dayPricingResult.paxPricing.map(p => ({
          pax: p.numPax,
          plusZero: p.withoutLeader.pricePerPerson,
          plusOne: p.withLeader.pricePerPerson
        }))
      },
      
      // Formatted for display
      formattedTable: pricingTableRows,
      
      // Service breakdown (for 2 pax)
      serviceBreakdown: dayPricingResult.services.map(s => ({
        day: s.dayNumber,
        type: s.serviceType,
        name: s.serviceName,
        unitCost: s.unitCost,
        isPerPax: s.isPerPax,
        source: s.rateSource
      })),
      
      // Warnings
      warnings: dayPricingResult.warnings,
      
      // Legacy compatibility check
      legacyCompatibility: {
        success: legacyResult.success,
        pricePerPerson: legacyResult.pricePerPerson,
        totalCost: legacyResult.totalCost,
        hasNewFields: !!legacyResult.paxPricingTable && !!legacyResult.singleSupplement
      }
    })
  } catch (error: any) {
    console.error('❌ Test pricing error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}