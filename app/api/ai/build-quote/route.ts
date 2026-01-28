import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { matchTourTemplate, getTemplateWithPricing } from '@/lib/tour-matcher-service'
import { calculatePricingFromRates, getFallbackRates } from '@/lib/rate-lookup-service'

// ============================================
// QUOTE BUILDER API
// File: app/api/ai/build-quote/route.ts
//
// Single endpoint that:
// 1. Matches request to tour templates
// 2. Calculates pricing from real rates
// 3. Returns ready-to-use quote data
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Require authentication - accesses pricing data and templates
    const authResult = await requireAuth()
    if (authResult.error) {
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

    const body = await request.json()
    const {
      // From WhatsApp parser
      tour_requested,
      cities = [],
      attractions = [],
      start_date,
      duration_days = 1,
      num_adults = 2,
      num_children = 0,
      language = 'English',
      interests = [],
      budget_level = 'standard',
      nationality = null,
      is_euro_passport = null,
      // Options
      include_lunch = true,
      include_dinner = false,
      include_accommodation = false,
      use_template = true,  // Whether to try matching templates
      template_id = null    // Force specific template
    } = body

    const totalPax = num_adults + num_children

    // ============================================
    // DETERMINE EUR/NON-EUR PASSPORT
    // ============================================
    let isEuroPassport = is_euro_passport
    if (isEuroPassport === null && nationality) {
      const euCountries = [
        'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark',
        'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland',
        'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands',
        'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden',
        'norway', 'iceland', 'liechtenstein', 'switzerland'
      ]
      isEuroPassport = euCountries.some(c => 
        nationality.toLowerCase().includes(c)
      )
    }
    isEuroPassport = isEuroPassport ?? false

    console.log('📊 Building quote for:', {
      tour_requested,
      pax: totalPax,
      duration: duration_days,
      passport: isEuroPassport ? 'EUR' : 'non-EUR'
    })

    // ============================================
    // STEP 1: MATCH TOUR TEMPLATE (if enabled)
    // ============================================
    let matchResult = null
    let templateData = null

    if (use_template) {
      if (template_id) {
        // Use specific template
        templateData = await getTemplateWithPricing(
          supabase, 
          template_id, 
          totalPax, 
          isEuroPassport
        )
        
        if (templateData) {
          matchResult = {
            success: true,
            best_match: {
              template_id: templateData.template.id,
              template_name: templateData.template.template_name,
              match_score: 100,
              match_reasons: ['Explicitly selected']
            },
            custom_tour_recommended: false
          }
        }
      } else {
        // Auto-match template
        matchResult = await matchTourTemplate(supabase, {
          tour_requested,
          cities,
          attractions,
          duration_days,
          interests,
          budget_level
        })

        if (matchResult.best_match && matchResult.best_match.match_score >= 50) {
          templateData = await getTemplateWithPricing(
            supabase,
            matchResult.best_match.template_id,
            totalPax,
            isEuroPassport
          )
        }
      }
    }

    // ============================================
    // STEP 2: CALCULATE PRICING
    // ============================================
    let pricingResult

    // Try to use template pricing first
    if (templateData && templateData.pricing && templateData.pricing.length > 0) {
      // Use pre-calculated pricing from tour_pricing table
      const pricing = templateData.pricing[0]
      pricingResult = {
        success: true,
        total_cost: pricing.grand_total,
        per_person_cost: pricing.per_person_total,
        source: 'template_pricing',
        breakdown: {
          transportation: { total: pricing.total_transportation, per_day: pricing.total_transportation / duration_days },
          guide: { total: pricing.total_guides, per_day: pricing.total_guides / duration_days },
          entrances: { total: pricing.total_entrances, per_person: pricing.total_entrances / totalPax },
          meals: { total: pricing.total_meals },
          accommodation: { total: pricing.total_accommodation }
        }
      }
    } else {
      // Calculate from rate tables
      const city = cities[0] || 
                   (templateData?.template?.cities_covered?.[0]) || 
                   'Cairo'

      try {
        const calculated = await calculatePricingFromRates(supabase, {
          city,
          pax: totalPax,
          language,
          is_euro_passport: isEuroPassport,
          duration_days,
          num_adults,
          num_children,
          include_lunch,
          include_dinner,
          include_accommodation,
          hotel_standard: budget_level as 'budget' | 'standard' | 'luxury',
          attractions: attractions.length > 0 ? attractions : undefined
        })

        if (calculated.success && calculated.total_cost > 0) {
          pricingResult = {
            ...calculated,
            source: 'database_rates'
          }
        } else {
          throw new Error('No rates found')
        }
      } catch (e) {
        // Fallback to hardcoded rates
        const fallback = getFallbackRates({
          pax: totalPax,
          duration_days,
          language,
          is_euro_passport: isEuroPassport
        })
        pricingResult = {
          ...fallback,
          source: 'fallback_rates'
        }
      }
    }

    // ============================================
    // STEP 3: BUILD QUOTE RESPONSE
    // ============================================
    const quote = {
      // Request summary
      request: {
        tour_requested,
        cities: cities.length > 0 ? cities : (templateData?.template?.cities_covered || ['Cairo']),
        duration_days,
        num_adults,
        num_children,
        total_pax: totalPax,
        language,
        budget_level,
        passport_type: isEuroPassport ? 'EUR' : 'non-EUR',
        start_date
      },

      // Template match (if any)
      template_match: matchResult ? {
        found: !!matchResult.best_match,
        template_id: matchResult.best_match?.template_id || null,
        template_name: matchResult.best_match?.template_name || null,
        match_score: matchResult.best_match?.match_score || 0,
        match_reasons: matchResult.best_match?.match_reasons || [],
        custom_recommended: matchResult.custom_tour_recommended,
        recommendation: matchResult.recommendation,
        all_matches: matchResult.matches?.slice(0, 3) || []
      } : null,

      // Pricing
      pricing: {
        total_cost: pricingResult.total_cost,
        per_person_cost: pricingResult.per_person_cost,
        currency: 'EUR',
        source: pricingResult.source,
        breakdown: pricingResult.breakdown,
        rates_used: pricingResult.rates_used || null
      },

      // Template details (if matched)
      template_details: templateData ? {
        name: templateData.template.template_name,
        code: templateData.template.template_code,
        tour_type: templateData.template.tour_type,
        highlights: templateData.template.highlights || [],
        cities_covered: templateData.template.cities_covered || [],
        days_count: templateData.days.length,
        variations: templateData.variations.map((v: any) => ({
          name: v.variation_name,
          tier: v.tier,
          pax_range: `${v.min_pax}-${v.max_pax}`
        }))
      } : null,

      // Metadata
      meta: {
        generated_at: new Date().toISOString(),
        pricing_source: pricingResult.source,
        template_used: !!templateData
      }
    }

    console.log('✅ Quote built:', {
      total: quote.pricing.total_cost,
      per_person: quote.pricing.per_person_cost,
      template: quote.template_match?.template_name || 'custom',
      source: quote.pricing.source
    })

    return NextResponse.json({
      success: true,
      data: quote
    })

  } catch (error: any) {
    console.error('❌ Error building quote:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to build quote'
      },
      { status: 500 }
    )
  }
}