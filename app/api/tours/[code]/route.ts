import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { templateDaysToDetail } from '@/lib/tours/tour-detail-days'

// ============================================
// TOUR DETAIL API - WITH VARIATION_ID
// File: app/api/tours/[code]/route.ts
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const VARIATION_SELECT = `
        *,
        tour_templates (
          id,
          template_code,
          template_name,
          short_description,
          long_description,
          highlights,
          main_attractions,
          duration_days,
          duration_nights,
          tour_theme,
          destinations (destination_name)
        )
      `

    // Fetch variation with all related data (removed tour_days - doesn't exist)
    let { data: variation, error: varError } = await supabase
      .from('tour_variations')
      .select(VARIATION_SELECT)
      .eq('variation_code', code)
      .maybeSingle()

    // Links (and old bookmarks) carry the TEMPLATE UUID instead of a variation
    // code — resolve those to the template's first active variation.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)
    if (!variation && !varError && isUuid) {
      const fallback = await supabase
        .from('tour_variations')
        .select(VARIATION_SELECT)
        .eq('template_id', code)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      variation = fallback.data
      varError = fallback.error
    }

    if (varError) {
      console.error('Variation fetch error:', varError)
      throw varError
    }

    // A variation is a PRICING SHAPE (tier, private/shared), not the tour. On
    // 2026-09-18 there was exactly ONE variation row in the whole database and
    // 44 templates, so every tour in every inventory dead-ended on "Tour not
    // found". The tour is the template; the variation, when it exists, adds
    // the B2B numbers.
    const TEMPLATE_SELECT = `
        id,
        tenant_id,
        template_code,
        template_name,
        short_description,
        long_description,
        highlights,
        main_attractions,
        duration_days,
        duration_nights,
        tour_theme,
        itinerary,
        inclusions,
        exclusions,
        destinations (destination_name)
      `

    interface TemplateRow {
      id: string
      tenant_id?: string | null
      template_code?: string | null
      template_name?: string | null
      short_description?: string | null
      long_description?: string | null
      highlights?: string[] | null
      main_attractions?: string[] | null
      duration_days?: number | null
      duration_nights?: number | null
      tour_theme?: string | null
      itinerary?: unknown
      inclusions?: string[] | null
      exclusions?: string[] | null
      destinations?: { destination_name?: string | null } | null
    }

    let template: TemplateRow | null = (variation?.tour_templates as TemplateRow | undefined) ?? null
    if (!template) {
      const byCode = await supabase
        .from('tour_templates')
        .select(TEMPLATE_SELECT)
        .eq(isUuid ? 'id' : 'template_code', code)
        .maybeSingle()
      if (byCode.error) {
        console.error('Template fetch error:', byCode.error)
        throw byCode.error
      }
      template = byCode.data as TemplateRow | null
    } else {
      // The variation's join carries no itinerary column; read the rest.
      const full = await supabase
        .from('tour_templates')
        .select(TEMPLATE_SELECT)
        .eq('id', template.id)
        .maybeSingle()
      if (full.data) template = { ...template, ...(full.data as TemplateRow) }
    }

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Tour not found' },
        { status: 404 }
      )
    }

    // Fetch services from tour_variation_services (for B2B pricing)
    const { data: variationServices } = variation
      ? await supabase
          .from('tour_variation_services')
          .select('*')
          .eq('variation_id', variation.id)
          .order('sequence_order')
      : { data: null }

    // Also fetch legacy services if they exist
    const { data: legacyServices } = variation
      ? await supabase
          .from('variation_services')
          .select('service_category, service_name, quantity_type, cost_per_unit, applies_to_day')
          .eq('variation_id', variation.id)
          .eq('is_mandatory', true)
          .order('service_category')
      : { data: null }

    // Fetch daily itinerary from variation_daily_itinerary
    const { data: varItinerary } = variation
      ? await supabase
          .from('variation_daily_itinerary')
          .select('*')
          .eq('variation_id', variation.id)
          .order('day_number', { ascending: true })
      : { data: null }

    // The programme comes from the template's days — where the day editor and
    // the days CSV write it — unless this variation overrides them.
    const dailyItinerary = (varItinerary && varItinerary.length > 0)
      ? varItinerary.map((day: any) => ({
          day_number: day.day_number,
          day_title: day.day_title || day.title,
          day_description: day.day_description || day.description,
          city: day.city,
          overnight_city: day.overnight_city,
          breakfast_included: day.breakfast_included,
          lunch_included: day.lunch_included,
          dinner_included: day.dinner_included
        }))
      : templateDaysToDetail(template.itinerary)

    // Combine services - prefer new system, fall back to legacy
    const services = variationServices && variationServices.length > 0
      ? variationServices.map((s: any) => ({
          service_category: s.service_category,
          service_name: s.service_name,
          quantity_type: s.quantity_mode,
          cost_per_unit: s.cost_per_unit
        }))
      : legacyServices || []

    // The variation's OPTIONAL SERVICE lines (is_optional — the priced options
    // it sells, migration 320) are the source of truth for the "Optional
    // Extras" list; the legacy optional_extras names are kept only for anything
    // never migrated into a service row. Read through the same client as the
    // variation so visibility matches; an empty result simply falls back.
    const { data: optionRows } = variation
      ? await supabase
          .from('tour_variation_services')
          .select('service_name')
          .eq('variation_id', variation.id)
          .eq('is_optional', true)
          .order('sequence_order', { ascending: true })
      : { data: null }
    const optionNames = (optionRows || []).map((o: { service_name: string }) => o.service_name)
    const legacyNames = Array.isArray(variation?.optional_extras)
      ? (variation.optional_extras as unknown[]).filter((n): n is string => typeof n === 'string')
      : []
    const optionalExtraNames = [
      ...optionNames,
      ...legacyNames.filter((n) => !optionNames.includes(n)),
    ]

    // The theme is a vocabulary key; show the agency's own word for it.
    const themeLabels = new Map(
      (await loadVocabulary(supabase, 'tour_theme')).map(i => [i.key, i.label])
    )
    const themeKey = template.tour_theme || null

    // Format response - INCLUDE variation_id for dynamic pricing
    const tourDetail = {
      // Null when nobody has built a pricing shape yet. The page shows the
      // programme and says so, instead of refusing to open the tour.
      variation_id: variation?.id ?? null,
      template_id: template.id,
      template_name: template.template_name,
      template_code: template.template_code,
      tour_theme: themeKey,
      category_name: themeKey ? (themeLabels.get(themeKey) || themeKey) : 'Uncategorized',
      destination_name: template.destinations?.destination_name || 'Various',
      duration_days: template.duration_days,
      duration_nights: template.duration_nights || 0,
      short_description: template.short_description,
      long_description: template.long_description,
      highlights: template.highlights || [],
      main_attractions: template.main_attractions || [],
      variation_name: variation?.variation_name ?? null,
      variation_code: variation?.variation_code ?? null,
      tier: variation?.tier ?? null,
      group_type: variation?.group_type ?? null,
      min_pax: variation?.min_pax ?? null,
      max_pax: variation?.max_pax ?? null,
      inclusions: variation?.inclusions || template.inclusions || [],
      exclusions: variation?.exclusions || template.exclusions || [],
      optional_extras: optionalExtraNames,
      guide_type: variation?.guide_type ?? null,
      guide_languages: variation?.guide_languages || ['English', 'Arabic'],
      vehicle_type: variation?.vehicle_type ?? null,
      services: services,
      daily_itinerary: dailyItinerary,
      // Flag to indicate if dynamic pricing is available
      has_dynamic_pricing: Boolean(variationServices && variationServices.length > 0)
    }

    // The operator's PUBLIC contact details, for the page's "Need Help?" card.
    // This page is public and previously hardcoded one operator's email/phone —
    // on every tenant's tours. Name/email/phone/website only; nothing sensitive.
    let operator = null
    const tenantId = variation?.tenant_id ?? template.tenant_id
    if (tenantId) {
      const { data: t } = await supabase
        .from('tenants')
        .select('company_name, contact_email, company_phone, company_website')
        .eq('id', tenantId)
        .maybeSingle()
      if (t) operator = t
    }

    return NextResponse.json({
      success: true,
      data: tourDetail,
      operator
    })

  } catch (error) {
    console.error('Error fetching tour detail:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch tour details',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}