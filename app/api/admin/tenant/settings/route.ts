import { SUPPORTED_CURRENCIES } from '@/lib/currency'
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
    if (authResult.error !== null) {
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

    // Get full tenant details
    const { data: tenantData, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      settings: {
        id: tenantData.id,
        company_name: tenantData.company_name,
        contact_email: tenantData.contact_email,
        logo_url: tenantData.logo_url,
        primary_color: tenantData.primary_color,
        secondary_color: tenantData.secondary_color,
        timezone: tenantData.timezone,
        date_format: tenantData.date_format,
        currency: tenantData.currency,
        office_email_addresses: (tenantData as { office_email_addresses?: string[] }).office_email_addresses ?? [],
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
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id, user } = authResult
    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Check if user has admin access
    const { data: currentMember } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant_id)
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
      'settings',
      // Addresses (or whole domains) that count as the office writing, beyond
      // the connected mailbox and its own domain (migration 367).
      'office_email_addresses',
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

    // The agency currency drives invoices, commissions and P&L (migration 281
    // mirrors it into default_currency): only a supported code.
    if ('currency' in updates) {
      const c = String(updates.currency ?? '').trim().toUpperCase()
      if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(c)) {
        return NextResponse.json({ success: false, error: `Currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}` }, { status: 400 })
      }
      updates.currency = c
    }
    // `settings` is merged into what is stored, not written over it: a
    // partial object wiped every other setting.
    if ('settings' in updates) {
      if (!updates.settings || typeof updates.settings !== 'object' || Array.isArray(updates.settings)) {
        return NextResponse.json({ success: false, error: 'settings must be an object' }, { status: 400 })
      }
      const { data: current } = await supabase.from('tenants').select('settings').eq('id', tenant_id).maybeSingle()
      const stored = (current as { settings?: Record<string, unknown> | null } | null)?.settings
      updates.settings = { ...(stored && typeof stored === 'object' ? stored : {}), ...updates.settings }
    }
    if ('office_email_addresses' in updates) {
      if (!Array.isArray(updates.office_email_addresses)) {
        return NextResponse.json({ success: false, error: 'office_email_addresses must be a list' }, { status: 400 })
      }
      updates.office_email_addresses = (updates.office_email_addresses as unknown[])
        .map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean)
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
      .eq('id', tenant_id)
      .select()
      .single()

    if (updateError) throw updateError

    // Log activity
    await logActivity(
      tenant_id,
      user.id,
      'tenant.settings_updated',
      {
        resourceType: 'tenant',
        resourceId: tenant_id,
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
