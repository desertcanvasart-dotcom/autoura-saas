import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// ============================================
// B2B QUOTES API - Single Quote Operations
// File: app/api/b2b/quotes/[id]/route.ts
// ============================================

// Service-role client (auth is enforced per-handler via requireAuth)
function getSupabaseAdmin() {
  return createAdminClient()
}

// GET - Single quote by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { data, error } = await (getSupabaseAdmin() as any)
      .from('tour_quotes')
      .select(`
        *,
        tour_variations (
          variation_name, variation_code, tier, group_type,
          inclusions, exclusions,
          tour_templates (
            template_name, template_code, duration_days, duration_nights,
            short_description
          )
        ),
        b2b_partners (company_name, partner_code, contact_name, email)
      `)
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .single()

    if (error) {
      console.error('Error fetching quote:', error)
      return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })

  } catch (error: any) {
    console.error('Error in GET /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update quote
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params
    const body = await request.json()

    // Remove id and tenant_id from body if present to avoid conflicts / reassignment
    const { id: _, tenant_id: _ignoredTenantId, ...updates } = body
    updates.updated_at = new Date().toISOString()

    const { data, error } = await (getSupabaseAdmin() as any)
      .from('tour_quotes')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating quote:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })

  } catch (error: any) {
    console.error('Error in PUT /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// DELETE - Delete quote
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { error } = await getSupabaseAdmin()
      .from('tour_quotes')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

    if (error) {
      console.error('Error deleting quote:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error in DELETE /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}