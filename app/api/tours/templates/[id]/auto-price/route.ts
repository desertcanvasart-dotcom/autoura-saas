// ============================================
// AUTO-PRICING API
// File: app/api/tours/templates/[id]/auto-price/route.ts
//
// Calculate tour pricing automatically from:
// - tour_day_activities (Content Library links)
// - Rate tables (vehicles, guides, entrance_fees, etc.)
// - Tier-based defaults
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { 
  calculateAutoPricing, 
  calculateMultiTierPricing,
  getTemplatePriceRange,
  ServiceTier 
} from '@/lib/auto-pricing-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const body = await request.json()

    const {
      tier = 'standard',
      num_pax = 2,
      num_adults,
      num_children = 0,
      is_eur_passport = true,
      language = 'English',
      travel_date,
      margin_percent = 25,
      meal_plan = 'lunch_only',
      include_accommodation = false,
      // Multi-tier mode
      all_tiers = false,
      tiers = ['budget', 'standard', 'deluxe', 'luxury']
    } = body

    // Validate tier
    const validTiers: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']
    if (!all_tiers && !validTiers.includes(tier)) {
      return NextResponse.json(
        { success: false, error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` },
        { status: 400 }
      )
    }

    // Multi-tier pricing (for comparison view)
    if (all_tiers) {
      const selectedTiers = tiers.filter((t: string) => validTiers.includes(t as ServiceTier)) as ServiceTier[]
      
      const results = await calculateMultiTierPricing(
        templateId,
        selectedTiers,
        num_pax,
        is_eur_passport,
        {
          numAdults: num_adults || num_pax,
          numChildren: num_children,
          language,
          travelDate: travel_date,
          marginPercent: margin_percent,
          mealPlan: meal_plan,
          includeAccommodation: include_accommodation
        }
      )

      // Convert Map to object for JSON response
      const tieredResults: Record<string, any> = {}
      for (const [t, result] of results) {
        tieredResults[t] = result
      }

      return NextResponse.json({
        success: true,
        data: {
          template_id: templateId,
          num_pax,
          is_eur_passport,
          tiers: tieredResults,
          comparison: {
            lowest_price: Math.min(...Object.values(tieredResults).map((r: any) => r.pricePerPerson)),
            highest_price: Math.max(...Object.values(tieredResults).map((r: any) => r.pricePerPerson))
          }
        }
      })
    }

    // Single tier pricing
    const result = await calculateAutoPricing({
      templateId,
      tier: tier as ServiceTier,
      numPax: num_pax,
      numAdults: num_adults || num_pax,
      numChildren: num_children,
      isEurPassport: is_eur_passport,
      language,
      travelDate: travel_date,
      marginPercent: margin_percent,
      mealPlan: meal_plan,
      includeAccommodation: include_accommodation
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to calculate pricing', warnings: result.warnings },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result
    })

  } catch (error: any) {
    console.error('❌ Auto-pricing error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to calculate pricing' },
      { status: 500 }
    )
  }
}

// GET endpoint for quick price range
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const { searchParams } = new URL(request.url)
    
    const isEurPassport = searchParams.get('is_eur') !== 'false'
    const numPax = parseInt(searchParams.get('num_pax') || '2')
    const tier = (searchParams.get('tier') || 'standard') as ServiceTier

    // Quick pricing with defaults
    const result = await calculateAutoPricing({
      templateId,
      tier,
      numPax,
      isEurPassport
    })

    return NextResponse.json({
      success: result.success,
      data: {
        template_id: templateId,
        template_name: result.templateName,
        tier,
        num_pax: numPax,
        total_days: result.totalDays,
        price_per_person: result.pricePerPerson,
        selling_price: result.sellingPrice,
        subtotal_cost: result.subtotalCost,
        margin_percent: result.marginPercent,
        currency: result.currency,
        services_count: result.services.length,
        warnings: result.warnings
      }
    })

  } catch (error: any) {
    console.error('❌ Auto-pricing GET error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get pricing' },
      { status: 500 }
    )
  }
}
