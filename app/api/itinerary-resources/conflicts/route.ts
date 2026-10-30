// app/api/itinerary-resources/conflicts/route.ts
// ============================================
// AUTOURA - RESOURCE CONFLICT DETECTION API
// ============================================
// Detects scheduling conflicts for resource assignments
// Multi-tenancy: Only checks conflicts within same tenant
// Security: RLS ensures tenant isolation
// ============================================

import { createAuthenticatedClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

import { computeConflicts, type ResourceRow } from '@/lib/itinerary-resource-conflicts'
export { computeConflicts, type ConflictRow } from '@/lib/itinerary-resource-conflicts'

/**
 * GET /api/itinerary-resources/conflicts?itinerary_id=xxx
 * Detect resource conflicts for a specific itinerary
 * Only checks conflicts within the user's tenant (via RLS)
 *
 * Returns array of conflicts with:
 * - resource_id: ID of conflicting resource
 * - resource_name: Name of resource
 * - conflicting_itinerary: Code of other itinerary
 * - dates: Date range of conflict
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()
    const { searchParams } = new URL(request.url)

    const itineraryId = searchParams.get('itinerary_id')

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'itinerary_id required' },
        { status: 400 }
      )
    }

    // This itinerary's confirmed assignments (RLS scopes to tenant).
    // A `resource_conflicts` view was once queried first, but it does not exist
    // in the live schema — that query failed on every request and always fell
    // through to this path.
    const { data: resources, error: resourcesError } = await supabase
      .from('itinerary_resources')
      .select('*')
      .eq('itinerary_id', itineraryId)
      .eq('status', 'confirmed')

    if (resourcesError) {
      console.error('❌ Error fetching resources:', resourcesError)
      throw resourcesError
    }

    if (!resources || resources.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    // ONE query for every candidate, instead of one per resource. Was N+1:
    // an itinerary with 20 confirmed resources issued 20 sequential overlap
    // queries, so latency grew linearly. RLS keeps this tenant-scoped; the
    // exact (type, id) pairing and the date overlap are decided in memory by
    // computeConflicts. resource_id narrows the fetch; resource_type is matched
    // in the grouping key.
    const resourceIds = [...new Set((resources as ResourceRow[]).map(r => r.resource_id))]

    const { data: candidates, error: conflictError } = await supabase
      .from('itinerary_resources')
      .select(`
        resource_type,
        resource_id,
        start_date,
        end_date,
        itinerary_id,
        itineraries!inner (
          itinerary_code
        )
      `)
      .in('resource_id', resourceIds)
      .eq('status', 'confirmed')
      .neq('itinerary_id', itineraryId)

    if (conflictError) {
      console.error('❌ Error fetching candidate assignments:', conflictError)
      throw conflictError
    }

    const conflicts = computeConflicts(
      resources as ResourceRow[],
      (candidates ?? []) as unknown as ResourceRow[]
    )

    return NextResponse.json({ success: true, data: conflicts })
  } catch (error: any) {
    console.error('❌ Error checking conflicts:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check conflicts' },
      { status: 500 }
    )
  }
}
