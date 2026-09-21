// ============================================
// /api/tours/browse — the LIST of tours. It does not price them.
// ============================================
// This route used to run the pricing engine for every tour on the page before
// it answered — ~30 database round trips a tour (#467) — so the tours page
// showed nothing for 5–8 seconds on production data. The list is now the list;
// the page asks /api/tours/browse/prices for the "starting from" figures
// afterwards and fills each card in as its answer arrives.
//
// It matters more since #484: every tour with days is priced, not only the
// ones with a flag set, so there are more prices to wait for.

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { dayCountOf } from '@/lib/tours/starting-from'
import { loadVocabulary } from '@/lib/vocabulary-server'

const MAX_LIMIT = 200

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
    // The tours page has no pager and used to send no `limit` — so it only ever
    // listed the FIRST 12 tours, and 7 of Sawa Tours' 19 and 9 of Travel2Egypt's
    // 21 never appeared on it. Listing is cheap now; the ceiling is for safety.
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '12') || 12, 1), MAX_LIMIT)
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
        itinerary,
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

    const listed = (templates || []).map((template) => {
        // Filter variations by tier if specified
        let variations = template.tour_variations?.filter((v: any) => v.is_active) || []

        if (tier) {
          variations = variations.filter((v: any) => v.tier === tier)
        }

        const dayCount = dayCountOf(template)

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
          default_variation_code: variations[0]?.variation_code ?? null,
          // …and once the price arrives the card can link to the variation its
          // "starting from" TIER describes, which is what this used to pick
          // when the price was computed here.
          variation_code_by_tier: Object.fromEntries(
            (variations as Array<{ tier?: string | null; variation_code?: string | null }>)
              .filter(v => v.tier && v.variation_code)
              .map(v => [v.tier as string, v.variation_code as string])
          ),

          // Variations summary
          variations_count: variations.length,
          available_tiers: [...new Set(variations.map((v: any) => v.tier))],
          min_pax: Math.min(...variations.map((v: any) => v.min_pax || 1)),
          max_pax: Math.max(...variations.map((v: any) => v.max_pax || 15)),
          
          // No price here: see /api/tours/browse/prices.
          currency: 'EUR',

          // Flags
          // How many days the programme has. 0 = nothing to price from yet.
          day_count: dayCount,
        }
      })

    return NextResponse.json({
      success: true,
      data: {
        templates: listed,
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
