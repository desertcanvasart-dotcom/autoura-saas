import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { PRICING_TIERS } from '@/lib/pricing-config'

// GET current pricing tier
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id } = authResult
    const adminClient = createAdminClient()

    // Get tenant features to determine current tier
    const { data: features, error } = await adminClient
      .from('tenant_features')
      .select('current_pricing_tier')
      .eq('tenant_id', tenant_id)
      .single()

    if (error) {
      console.error('Error fetching pricing tier:', error)
      // Default to professional if no tier set
      return NextResponse.json({
        success: true,
        tier: 'professional'
      })
    }

    return NextResponse.json({
      success: true,
      tier: features?.current_pricing_tier || 'professional'
    })
  } catch (error: any) {
    console.error('Error in pricing tier GET:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST update pricing tier
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, role } = authResult

    // Only owners and admins can change tiers
    if (!['owner', 'admin'].includes(role || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { tier } = body

    // Validate tier
    if (!PRICING_TIERS[tier]) {
      return NextResponse.json(
        { success: false, error: 'Invalid pricing tier' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()
    const selectedTier = PRICING_TIERS[tier]



    // Check if tenant_features record exists
    const { data: existingFeatures, error: fetchError } = await adminClient
      .from('tenant_features')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is ok
      console.error('Error fetching tenant features:', fetchError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch tenant features' },
        { status: 500 }
      )
    }

    // Business model is NOT derived from the tier any more.
    //
    // b2c_enabled / b2b_enabled / business_type are a free per-tenant workspace
    // preference — every tier gets both — so a plan change must not silently
    // rewrite which workspaces a tenant sees. They are deliberately absent from
    // updateData below; changing tier no longer touches them.
    //
    // Capabilities that do not exist yet (multi-brand branding, API access,
    // white-label, SSO) are not written either: a flag with no mechanism behind
    // it is worse than no flag.
    const updateData = {
      current_pricing_tier: tier,
      // null = unlimited, matching the column convention.
      max_users: selectedTier.limits.users,
      max_partners: selectedTier.limits.b2bPartners,
      // Always-on capabilities, kept true so existing gates do not regress.
      whatsapp_integration: true,
      email_integration: true,
      pdf_generation: true,
      analytics_enabled: true,
      updated_at: new Date().toISOString()
    }

    let result

    if (!existingFeatures) {
      // Insert new record

      result = await adminClient
        .from('tenant_features')
        .insert({
          tenant_id,
          ...updateData
        })
        .select()
        .single()
    } else {
      // Update existing record

      result = await adminClient
        .from('tenant_features')
        .update(updateData)
        .eq('tenant_id', tenant_id)
        .select()
        .single()
    }

    if (result.error) {
      console.error('Error saving pricing tier:', result.error)
      return NextResponse.json(
        { success: false, error: 'Failed to save pricing tier', details: result.error.message },
        { status: 500 }
      )
    }



    // `tenants.business_type` is deliberately NOT touched here.
    //
    // It used to be recomputed from the tier's b2c/b2b feature flags, so
    // changing plan could silently flip a DMC from "b2c_and_b2b" to
    // "b2b_only" and hide half their workspace. Business model is now a free
    // per-tenant preference on every tier, owned by Settings → Organization.

    return NextResponse.json({
      success: true,
      message: 'Pricing tier updated successfully',
      tier,
      features: result.data
    })
  } catch (error: any) {
    console.error('Error in pricing tier POST:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
