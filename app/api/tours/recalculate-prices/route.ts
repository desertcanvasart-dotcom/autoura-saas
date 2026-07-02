// ============================================
// TOUR PRICE RECALCULATION API
// File: app/api/tours/recalculate-prices/route.ts
//
// Recalculates and caches "starting from" prices for all tours.
// Can be called manually or via a cron job.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { getTemplatePriceRange } from '@/lib/auto-pricing-service'

export async function POST(request: NextRequest) {
  try {
    // Cron path: valid only when CRON_SECRET is configured AND matches (fail closed).
    // Cron calls recalculate all tenants; session calls are scoped to the user's tenant.
    const { searchParams } = new URL(request.url)
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = searchParams.get('secret') || request.headers.get('x-cron-secret')
    const isCronCall = Boolean(cronSecret && providedSecret === cronSecret)

    let tenantId: string | null = null
    if (!isCronCall) {
      const authResult = await requireAuth()
      if (authResult.error) {
        return NextResponse.json(
          { success: false, error: authResult.error },
          { status: authResult.status }
        )
      }
      tenantId = authResult.tenant_id
    }

    const supabaseAdmin = createAdminClient()

    // Parse request body for optional template ID
    let templateId: string | null = null
    try {
      const body = await request.json()
      templateId = body.templateId || null
    } catch {
      // No body provided, recalculate all
    }

    console.log('🔄 Starting price recalculation...')
    const startTime = Date.now()

    // Fetch templates to recalculate
    let query = supabaseAdmin
      .from('tour_templates')
      .select('id, template_name, duration_days, uses_day_builder, pricing_mode')
      .eq('is_active', true)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    if (templateId) {
      query = query.eq('id', templateId)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No templates to recalculate',
        updated: 0
      })
    }

    console.log(`📋 Found ${templates.length} templates to process`)

    const results: { id: string; name: string; price: number | null; tier: string | null; error?: string }[] = []

    // Process templates sequentially to avoid overwhelming the database
    for (const template of templates) {
      try {
        let startingPrice: number | null = null
        let startingTier: string | null = null

        // Only calculate auto-pricing for templates that use it
        if (template.uses_day_builder || template.pricing_mode === 'auto') {
          const priceRange = await getTemplatePriceRange(template.id)
          if (priceRange) {
            startingPrice = Math.round(priceRange.minPrice)
            startingTier = priceRange.tier
          }
        }

        // Fallback: check variation_pricing table
        // NOTE: our schema uses `price_per_person` (the sibling uses
        // `selling_price_per_person`). Keep this column name in sync if the
        // tour_variations pricing schema changes.
        if (startingPrice === null) {
          let variationsQuery = supabaseAdmin
            .from('tour_variations')
            .select('id')
            .eq('template_id', template.id)
            .eq('is_active', true)
          if (tenantId) {
            variationsQuery = variationsQuery.eq('tenant_id', tenantId)
          }
          const { data: variations } = await variationsQuery

          if (variations && variations.length > 0) {
            let pricingQuery = supabaseAdmin
              .from('variation_pricing')
              .select('price_per_person, tour_variations!inner(tier)')
              .in('variation_id', variations.map(v => v.id))
              .order('price_per_person', { ascending: true })
              .limit(1)
            if (tenantId) {
              pricingQuery = pricingQuery.eq('tenant_id', tenantId)
            }
            const { data: pricing } = await pricingQuery

            if (pricing && pricing.length > 0) {
              startingPrice = Math.round(pricing[0].price_per_person)
              startingTier = (pricing[0] as any).tour_variations?.tier || 'standard'
            }
          }
        }

        // Final fallback: estimate based on duration.
        // NOTE: this is the one fabricated value in this route — a rough
        // duration-based "starting from" for browse display when no real
        // rate-backed price exists. Set FABRICATE_STARTING_PRICE=false to
        // leave such templates unpriced (NULL) instead, per the no-fabricate
        // pricing-harness principle.
        if (startingPrice === null && process.env.FABRICATE_STARTING_PRICE !== 'false') {
          startingPrice = template.duration_days * 150
          startingTier = 'standard'
        }

        // Update the template with cached price
        let updateQuery = supabaseAdmin
          .from('tour_templates')
          .update({
            cached_starting_price: startingPrice,
            cached_starting_tier: startingTier,
            cached_price_updated_at: new Date().toISOString()
          })
          .eq('id', template.id)
        if (tenantId) {
          updateQuery = updateQuery.eq('tenant_id', tenantId)
        }
        const { error: updateError } = await updateQuery

        if (updateError) {
          console.error(`❌ Error updating ${template.template_name}:`, updateError)
          results.push({
            id: template.id,
            name: template.template_name,
            price: null,
            tier: null,
            error: updateError.message
          })
        } else {
          console.log(`✅ Updated ${template.template_name}: €${startingPrice} (${startingTier})`)
          results.push({
            id: template.id,
            name: template.template_name,
            price: startingPrice,
            tier: startingTier
          })
        }
      } catch (err: any) {
        console.error(`❌ Error processing ${template.template_name}:`, err)
        results.push({
          id: template.id,
          name: template.template_name,
          price: null,
          tier: null,
          error: err.message
        })
      }
    }

    const duration = Date.now() - startTime
    const successCount = results.filter(r => !r.error).length
    const errorCount = results.filter(r => r.error).length

    console.log(`🏁 Price recalculation complete in ${duration}ms`)
    console.log(`   ✅ Success: ${successCount} | ❌ Errors: ${errorCount}`)

    return NextResponse.json({
      success: true,
      message: `Recalculated prices for ${successCount} templates`,
      duration_ms: duration,
      updated: successCount,
      errors: errorCount,
      results
    })

  } catch (error: any) {
    console.error('❌ Recalculation error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to recalculate prices' },
      { status: 500 }
    )
  }
}

// GET endpoint to check status or trigger recalculation
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const supabaseAdmin = createAdminClient()

    // Check how many templates need price updates
    const { data: templates, error } = await supabaseAdmin
      .from('tour_templates')
      .select('id, template_name, cached_starting_price, cached_price_updated_at')
      .eq('is_active', true)
      .eq('tenant_id', authResult.tenant_id)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const withPrice = templates?.filter(t => t.cached_starting_price !== null) || []
    const withoutPrice = templates?.filter(t => t.cached_starting_price === null) || []

    // Check for stale prices (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const stalePrice = templates?.filter(t =>
      t.cached_price_updated_at && t.cached_price_updated_at < oneDayAgo
    ) || []

    return NextResponse.json({
      success: true,
      data: {
        total_templates: templates?.length || 0,
        with_cached_price: withPrice.length,
        without_cached_price: withoutPrice.length,
        stale_prices: stalePrice.length,
        templates_needing_update: withoutPrice.map(t => ({
          id: t.id,
          name: t.template_name
        }))
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
