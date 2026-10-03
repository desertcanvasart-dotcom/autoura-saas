// ============================================
// API Route: /api/guides/[id]
// ============================================
// Handles single guide operations
// GET: Get guide details
// PUT: Update guide
// DELETE: Delete guide
//
// A guide is a SUPPLIER row (supplier_type='guide') — the same source the
// list at /api/guides reads, and the id every guide picker stores. This
// route used to read the legacy `guides` table, so a guide picked in the app
// 404'd here (ResourceSummaryCard, the resources page's Delete).
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { evaluateDeleteGuard } from '@/lib/delete-guard'
import {
  GUIDE_SUPPLIER_TYPE,
  guideBodyToSupplierUpdate,
  supplierToGuide,
} from '@/lib/guides/supplier-guide'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const supabase = createAdminClient()
    const { id } = await params
    const tenant_id = authResult.tenant_id

    const { data: supplier, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('supplier_type', GUIDE_SUPPLIER_TYPE)
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (error) {
      console.error('Error fetching guide:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch guide' },
        { status: 500 }
      )
    }

    let guide: Record<string, unknown> | null = supplier ? supplierToGuide(supplier) : null

    // Assignments made before guides moved to suppliers may still point at
    // the legacy guides table (lib/staff-link.ts reads it the same way).
    // Read-only: nothing in the app edits or deletes those rows any more.
    if (!guide) {
      const { data: legacy } = await supabase
        .from('guides')
        .select('id, name, full_name, phone, whatsapp, email, city, languages, is_active, profile_photo_url')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .maybeSingle()
      if (legacy) {
        guide = {
          ...legacy,
          name: legacy.name ?? legacy.full_name,
          phone: legacy.phone || legacy.whatsapp,
          languages: legacy.languages || [],
          photo_url: legacy.profile_photo_url,
          legacy: true,
        }
      }
    }

    if (!guide) {
      return NextResponse.json(
        { success: false, error: 'Guide not found' },
        { status: 404 }
      )
    }

    // Get associated bookings
    const { data: bookings } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, client_name, start_date, end_date, total_cost')
      .eq('assigned_guide_id', id)
      .eq('tenant_id', tenant_id)
      .order('start_date', { ascending: true })

    return NextResponse.json({
      success: true,
      data: {
        ...guide,
        bookings: bookings || [],
      },
    })

  } catch (error) {
    console.error('Error in guide GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const supabase = createAdminClient()
    const { id } = await params
    const body = await request.json()

    const updateData = guideBodyToSupplierUpdate(body ?? {})
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No guide fields to update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', id)
      .eq('supplier_type', GUIDE_SUPPLIER_TYPE)
      .eq('tenant_id', authResult.tenant_id)
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error updating guide:', error)

      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A guide with this email already exists' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { success: false, error: 'Failed to update guide', details: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Guide not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: supplierToGuide(data),
      message: 'Guide updated successfully',
    })

  } catch (error) {
    console.error('Error in guide PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const supabase = createAdminClient()
    const { id } = await params
    const tenant_id = authResult.tenant_id

    const { data: existing, error: findError } = await supabase
      .from('suppliers')
      .select('id')
      .eq('id', id)
      .eq('supplier_type', GUIDE_SUPPLIER_TYPE)
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (findError) {
      console.error('Error finding guide:', findError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete guide' },
        { status: 500 }
      )
    }
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Guide not found' },
        { status: 404 }
      )
    }

    // Assignments live in itinerary_resources (mig 289; assigned_guide_id is
    // derived from the confirmed ones). Count every assignment, day-level and
    // unconfirmed included — deleting the guide would orphan any of them.
    const { count, error: countError } = await supabase
      .from('itinerary_resources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('resource_type', 'guide')
      .eq('resource_id', id)

    const guard = evaluateDeleteGuard('guide', [
      { label: `${count ?? 0} itinerary assignment(s)`, count, error: countError },
    ])
    if (!guard.ok) {
      return NextResponse.json(
        {
          success: false,
          error: guard.kind === 'blocked'
            ? `${guard.message} Or set the guide to inactive instead.`
            : guard.message,
        },
        { status: guard.kind === 'blocked' ? 409 : 500 }
      )
    }

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('supplier_type', GUIDE_SUPPLIER_TYPE)
      .eq('tenant_id', tenant_id)

    if (error) {
      console.error('Error deleting guide:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete guide' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Guide deleted successfully',
    })

  } catch (error) {
    console.error('Error in guide DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
