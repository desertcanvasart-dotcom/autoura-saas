import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

/**
 * GET /api/settings/whatsapp-ai
 * Get WhatsApp AI settings for the current tenant
 */
export async function GET() {
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

    // Get tenant features
    const { data: features, error } = await adminClient
      .from('tenant_features')
      .select('whatsapp_ai_enabled')
      .eq('tenant_id', tenant_id)
      .single()

    if (error) {
      console.error('Error fetching WhatsApp AI settings:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch settings' },
        { status: 500 }
      )
    }

    // Check if API key is configured (don't expose the actual key)
    const apiKeyConfigured = !!process.env.ANTHROPIC_API_KEY
    const globalEnabled = process.env.WHATSAPP_AI_ENABLED === 'true'
    const toolsEnabled = process.env.WHATSAPP_AI_TOOLS_ENABLED === 'true'

    return NextResponse.json({
      success: true,
      settings: {
        enabled: features?.whatsapp_ai_enabled || false,
        apiKeyConfigured,
        globalEnabled,
        toolsEnabled,
        model: process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514',
        canEnable: apiKeyConfigured && globalEnabled,
        availableTools: toolsEnabled ? [
          'Search customer trips & quotes',
          'Create trip inquiries',
          'Request quotes',
          'Send quote PDFs',
          'Check availability',
          'Escalate to human'
        ] : []
      }
    })
  } catch (error: any) {
    console.error('Error in WhatsApp AI settings GET:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/settings/whatsapp-ai
 * Update WhatsApp AI settings for the current tenant
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

    const { tenant_id, role } = authResult

    // Only admins and owners can update settings
    if (!['owner', 'admin'].includes(role || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Only admins can change AI settings.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { enabled } = body

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Invalid request: enabled must be a boolean' },
        { status: 400 }
      )
    }

    // Check prerequisites before enabling
    if (enabled) {
      const apiKeyConfigured = !!process.env.ANTHROPIC_API_KEY
      const globalEnabled = process.env.WHATSAPP_AI_ENABLED === 'true'

      if (!apiKeyConfigured) {
        return NextResponse.json(
          { success: false, error: 'Cannot enable AI: ANTHROPIC_API_KEY is not configured' },
          { status: 400 }
        )
      }

      if (!globalEnabled) {
        return NextResponse.json(
          { success: false, error: 'Cannot enable AI: WHATSAPP_AI_ENABLED is not set to true in environment' },
          { status: 400 }
        )
      }
    }

    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from('tenant_features')
      .update({
        whatsapp_ai_enabled: enabled,
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenant_id)

    if (error) {
      console.error('Error updating WhatsApp AI settings:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: enabled
        ? 'AI auto-reply enabled. Incoming WhatsApp messages will receive automated responses.'
        : 'AI auto-reply disabled. Messages will not receive automated responses.',
      settings: {
        enabled
      }
    })
  } catch (error: any) {
    console.error('Error in WhatsApp AI settings PATCH:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
