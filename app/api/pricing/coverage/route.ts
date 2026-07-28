// ============================================
// GET /api/pricing/coverage
// Rate-coverage report (harness Layer 4): runs the strict engine across the
// tenant's active templates × tiers and lists every rate-data hole, so gaps
// are found before a customer hits them.
//
// Query params:
//   templateId   optional — scope to one template (else all active, capped)
//   tier         optional — a single tier, or 'all' (default 'standard')
//   isEurPassport optional — 'false' to use non-EUR rates (default true)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { calculateDayBasedPricing, type ServiceTier } from '@/lib/auto-pricing-service'
import { computeCoverage } from '@/lib/pricing-coverage'

const ALL_TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']
const MAX_TEMPLATES = 25 // bound the work for a single diagnostic request

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('templateId')
    const tierParam = searchParams.get('tier')
    const isEurPassport = searchParams.get('isEurPassport') !== 'false'

    const tiers: ServiceTier[] =
      tierParam === 'all'
        ? ALL_TIERS
        : tierParam && ALL_TIERS.includes(tierParam as ServiceTier)
          ? [tierParam as ServiceTier]
          : ['standard']

    // RLS scopes templates to the caller's tenant.
    let query = supabase
      .from('tour_templates')
      .select('id, template_name')
      .eq('is_active', true)
      .order('template_name', { ascending: true })

    if (templateId) query = query.eq('id', templateId)

    const { data: templatesData, error } = await query
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const all = (templatesData || []).map((t: any) => ({ id: t.id, name: t.template_name }))
    const truncated = all.length > MAX_TEMPLATES
    const templates = all.slice(0, MAX_TEMPLATES)

    const report = await computeCoverage({
      templates,
      tiers,
      isEurPassport,
      calc: (args) => calculateDayBasedPricing({ ...args, tenantId: tenant_id }),
    })

    return NextResponse.json({
      success: true,
      tiers,
      isEurPassport,
      truncated,
      ...report,
    })
  } catch (e: any) {
    console.error('Pricing coverage error:', e)
    return NextResponse.json(
      { success: false, error: e.message || 'Coverage report failed' },
      { status: 500 }
    )
  }
}
