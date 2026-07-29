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

    // Manual conflict detection (RLS will filter to tenant's resources only).
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

    // Check each resource for conflicts with other itineraries
    // RLS ensures we only see conflicts within same tenant
    const conflicts: any[] = []

    for (const resource of resources) {
      // Find overlapping resource assignments
      // RLS policy will automatically filter to same tenant
      const { data: conflicting, error: conflictError } = await supabase
        .from('itinerary_resources')
        .select(`
          *,
          itineraries!inner (
            itinerary_code,
            client_name
          )
        `)
        .eq('resource_type', resource.resource_type)
        .eq('resource_id', resource.resource_id)
        .eq('status', 'confirmed')
        .neq('itinerary_id', itineraryId)
        .lte('start_date', resource.end_date || resource.start_date)
        .gte('end_date', resource.start_date)

      if (!conflictError && conflicting && conflicting.length > 0) {
        conflicting.forEach((c: any) => {
          conflicts.push({
            resource_id: resource.resource_id,
            resource_name: resource.resource_name,
            conflicting_itinerary: c.itineraries?.itinerary_code || c.itinerary_id,
            dates: `${c.start_date} - ${c.end_date || c.start_date}`
          })
        })
      }
    }

    return NextResponse.json({ success: true, data: conflicts })
  } catch (error: any) {
    console.error('❌ Error checking conflicts:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check conflicts' },
      { status: 500 }
    )
  }
}
