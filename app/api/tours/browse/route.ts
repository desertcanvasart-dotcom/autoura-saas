// ============================================
// B2B TOURS BROWSE API - UPDATED
// File: app/api/tours/browse/route.ts
//
// Now uses auto-pricing for "Starting From" price
// instead of requiring manual variation_pricing
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { getTemplatePriceRange } from '@/lib/auto-pricing-service'
import { loadVocabulary } from '@/lib/vocabulary-server'

export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    // The theme is stored as a vocabulary key; the card shows the agency's own
    // word for it. RLS scopes this to the caller's tenant like every other read.
    const themeLabels = new Map(
      (await loadVocabulary(supabase, 'tour_theme')).map(i => [i.key, i.label])
    )

    const { searchParams } = new URL(request.url)

    // Filters
    const tourType = searchParams.get('tour_type')
    const category = searchParams.get('category')
    const city = searchParams.get('city')
    const minDays = searchParams.get('min_days')
    const maxDays = searchParams.get('max_days')
    const tier = searchParams.get('tier')
    const search = searchParams.get('search')

    // Pagination
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const offset = (page - 1) * limit

    // Build query for templates (RLS filters to tenant's templates only)
    let query = supabase
      .from('tour_templates')
      .select(`
        id,
        tenant_id,
        template_name,
        template_code,
        tour_type,
        duration_days,
        cities_covered,
        highlights,
        short_description,
        is_featured,
        image_url,
        uses_day_builder,
        pricing_mode,
        tour_theme,
        tour_variations (
          id,
          variation_name,
          variation_code,
          tier,
          min_pax,
          max_pax,
          is_active
        )
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })

    // Apply filters
    if (tourType) {
      query = query.eq('tour_type', tourType)
    }

    if (category) {
      query = query.eq('tour_theme', category)
    }

    if (city) {
      query = query.contains('cities_covered', [city])
    }

    if (minDays) {
      query = query.gte('duration_days', parseInt(minDays))
    }

    if (maxDays) {
      query = query.lte('duration_days', parseInt(maxDays))
    }

    if (search) {
      query = query.or(`template_name.ilike.%${search}%,short_description.ilike.%${search}%`)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: templates, error, count } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Calculate pricing for each template
    const templatesWithPricing = await Promise.all(
      (templates || []).map(async (template) => {
        // Filter variations by tier if specified
        let variations = template.tour_variations?.filter((v: any) => v.is_active) || []
        
        if (tier) {
          variations = variations.filter((v: any) => v.tier === tier)
        }

        // Get auto-calculated price range
        let startingFromPrice: number | null = null
        let startingFromTier: string | null = null

        // If template uses day builder, use auto-pricing
        if (template.uses_day_builder || template.pricing_mode === 'auto') {
          const priceRange = await getTemplatePriceRange(template.id, template.tenant_id)
          if (priceRange) {
            startingFromPrice = priceRange.minPrice
            startingFromTier = priceRange.tier
          }
        }

        // Fallback: check for manual variation pricing
        if (startingFromPrice === null && variations.length > 0) {
          // Try to get from variation_pricing table (legacy) - RLS filters automatically
          const { data: pricing } = await supabase
            .from('variation_pricing')
            .select('price_per_person')
            .in('variation_id', variations.map((v: any) => v.id))
            .order('price_per_person', { ascending: true })
            .limit(1)

          if (pricing?.length) {
            startingFromPrice = pricing[0].price_per_person
          }
        }

        // No invented estimate. This used to fall back to
        // `duration_days * 150` labelled "standard", so a tour with no rates
        // behind it showed a made-up per-person price on the card — and the
        // filter below then hid the tours that had NO price, which meant the
        // fabricated one was the only thing anybody ever saw. A tour with no
        // price is listed without one.

        return {
          id: template.id,
          template_name: template.template_name,
          template_code: template.template_code,
          tour_type: template.tour_type,
          duration_days: template.duration_days,
          cities_covered: template.cities_covered || [],
          highlights: template.highlights || [],
          short_description: template.short_description,
          is_featured: template.is_featured,
          cover_image_url: template.image_url,
          tour_theme: template.tour_theme || null,
          theme_name: template.tour_theme ? (themeLabels.get(template.tour_theme) || template.tour_theme) : null,
          
          // Where "View Details" lands: the detail page is variation-centric
          // (looks up by variation_code), so hand the card the code of the
          // variation its "starting from" tier describes. Linking the
          // template UUID here was the bug that dead-ended every click.
          default_variation_code:
            (variations.find((v: { tier?: string }) => v.tier === startingFromTier) ?? variations[0])
              ?.variation_code ?? null,

          // Variations summary
          variations_count: variations.length,
          available_tiers: [...new Set(variations.map((v: any) => v.tier))],
          min_pax: Math.min(...variations.map((v: any) => v.min_pax || 1)),
          max_pax: Math.max(...variations.map((v: any) => v.max_pax || 15)),
          
          // Pricing
          starting_from: startingFromPrice,
          starting_from_tier: startingFromTier,
          currency: 'EUR',
          
          // Flags
          uses_day_builder: template.uses_day_builder,
          pricing_mode: template.pricing_mode || 'manual'
        }
      })
    )

    // Drop a nonsense number (Infinity/NaN from a broken rate) by blanking the
    // price — never by hiding the tour, which is what sent every card to the
    // fabricated estimate above.
    const validTemplates = templatesWithPricing.map(t =>
      t.starting_from !== null && Number.isFinite(t.starting_from) && t.starting_from > 0
        ? t
        : { ...t, starting_from: null, starting_from_tier: null }
    )

    return NextResponse.json({
      success: true,
      data: {
        templates: validTemplates,
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / limit)
        },
        filters: {
          tour_type: tourType,
          category,
          city,
          min_days: minDays,
          max_days: maxDays,
          tier,
          search
        }
      }
    })

  } catch (error: any) {
    console.error('❌ Browse error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch tours' },
      { status: 500 }
    )
  }
}
