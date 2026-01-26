import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { logActivity } from '@/lib/billing-middleware'

/**
 * GET /api/admin/tenant/settings
 * Get tenant settings
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant } = authResult

    // Get full tenant details
    const { data: tenantData, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant.id)
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      settings: {
        id: tenantData.id,
        company_name: tenantData.company_name,
        contact_email: tenantData.contact_email,
        business_type: tenantData.business_type,
        logo_url: tenantData.logo_url,
        primary_color: tenantData.primary_color,
        secondary_color: tenantData.secondary_color,
        timezone: tenantData.timezone,
        date_format: tenantData.date_format,
        currency: tenantData.currency,
        settings: tenantData.settings
      }
    })
  } catch (error: any) {
    console.error('Error fetching tenant settings:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/tenant/settings
 * Update tenant settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant, user } = authResult

    // Check if user has admin access
    const { data: currentMember } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .single()

    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json({
        success: false,
        error: 'Only owners and admins can update tenant settings'
      }, { status: 403 })
    }

    const body = await request.json()

    // Build update object with only allowed fields
    const updates: any = {}
    const allowedFields = [
      'company_name',
      'contact_email',
      'logo_url',
      'primary_color',
      'secondary_color',
      'timezone',
      'date_format',
      'currency',
      'settings'
    ]

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    // Validate color codes if provided
    if (updates.primary_color && !/^#[0-9A-F]{6}$/i.test(updates.primary_color)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid primary_color format. Must be hex color code (e.g., #3B82F6)'
      }, { status: 400 })
    }

    if (updates.secondary_color && !/^#[0-9A-F]{6}$/i.test(updates.secondary_color)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid secondary_color format. Must be hex color code (e.g., #10B981)'
      }, { status: 400 })
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid fields to update'
      }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    // Update tenant
    const { data: updatedTenant, error: updateError } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', tenant.id)
      .select()
      .single()

    if (updateError) throw updateError

    // Log activity
    await logActivity(
      tenant.id,
      user.id,
      'tenant.settings_updated',
      supabase,
      {
        resourceType: 'tenant',
        resourceId: tenant.id,
        details: {
          updated_fields: Object.keys(updates)
        }
      }
    )

    return NextResponse.json({
      success: true,
      settings: updatedTenant,
      message: 'Tenant settings updated successfully'
    })
  } catch (error: any) {
    console.error('Error updating tenant settings:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
