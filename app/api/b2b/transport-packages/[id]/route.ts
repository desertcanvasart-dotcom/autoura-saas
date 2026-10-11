import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { sanitizePackageVehicles } from '@/lib/pricing/package-vehicle'
import { roleDenied } from '@/lib/api-role-gate'

// ============================================
// B2B TRANSPORT PACKAGES API - Single Item
// File: app/api/b2b/transport-packages/[id]/route.ts
// ============================================

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
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied

    const { id } = await params
    const body = await request.json()

    // Only the fields the body carries: a partial update (an active toggle)
    // must not null the name or wipe every vehicle rate it did not send.
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ['package_code', 'package_name', 'package_type', 'origin_city', 'destination_city',
      'duration_days', 'description', 'includes', 'notes', 'is_active'] as const) {
      if (body[key] !== undefined) update[key] = body[key]
    }
    // Vehicles keyed by the agency's vehicle_type vocabulary (mig 381).
    if (body.vehicles !== undefined) update.vehicles = sanitizePackageVehicles(body.vehicles)

    const { data, error } = await (createAdminClient() as any)
      .from('b2b_transport_packages')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating transport package:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
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
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied

    const { id } = await params

    const { error } = await createAdminClient()
      .from('b2b_transport_packages')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

    if (error) {
      console.error('Error deleting transport package:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}