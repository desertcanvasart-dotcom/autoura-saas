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

    console.log(`[Pricing Tier] Updating tenant ${tenant_id} to tier: ${tier}`)

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

    // Determine business type from features
    let businessType: 'b2c_only' | 'b2b_only' | 'b2c_and_b2b'
    if (selectedTier.features.b2c && selectedTier.features.b2b) {
      businessType = 'b2c_and_b2b'
    } else if (selectedTier.features.b2c && !selectedTier.features.b2b) {
      businessType = 'b2c_only'
    } else {
      businessType = 'b2b_only'
    }

    const updateData = {
      current_pricing_tier: tier,
      max_users: selectedTier.maxUsers,
      max_quotes_per_month: selectedTier.maxQuotesPerMonth,
      b2c_enabled: selectedTier.features.b2c,
      b2b_enabled: selectedTier.features.b2b,
      whatsapp_integration: selectedTier.features.whatsapp,
      email_integration: selectedTier.features.email,
      pdf_generation: selectedTier.features.pdf,
      analytics_enabled: selectedTier.features.analytics,
      updated_at: new Date().toISOString()
    }

    let result

    if (!existingFeatures) {
      // Insert new record
      console.log(`[Pricing Tier] No existing features found, creating new record`)
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
      console.log(`[Pricing Tier] Updating existing features record`)
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

    console.log(`[Pricing Tier] Successfully updated to ${tier}:`, result.data)

    // Also update the tenant's business_type to match
    const { error: tenantUpdateError } = await adminClient
      .from('tenants')
      .update({
        business_type: businessType,
        updated_at: new Date().toISOString()
      })
      .eq('id', tenant_id)

    if (tenantUpdateError) {
      console.error('Error updating tenant business_type:', tenantUpdateError)
      // Don't fail the request, just log the error
    }

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
