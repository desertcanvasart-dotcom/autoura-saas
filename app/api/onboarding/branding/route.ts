import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Update tenant branding
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({
        tagline: body.tagline,
        updated_at: new Date().toISOString()
      })
      .eq('id', tenant_id)

    if (tenantError) {
      console.error('Error updating tenant branding:', tenantError)
      return NextResponse.json(
        { success: false, error: 'Failed to update branding' },
        { status: 500 }
      )
    }

    // Update tenant features with colors and logo
    const { error: featuresError } = await supabase
      .from('tenant_features')
      .update({
        logo_url: body.logo_url,
        primary_color: body.primary_color,
        secondary_color: body.secondary_color,
        onboarding_step: Math.max(2, body.current_step || 2),
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenant_id)

    if (featuresError) {
      console.error('Error updating tenant features:', featuresError)
      return NextResponse.json(
        { success: false, error: 'Failed to update branding features' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Branding saved successfully'
    })
  } catch (error) {
    console.error('Error in onboarding branding POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
