import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAdminClient } from '@/lib/supabase-server';
import { roleDenied } from '@/lib/api-role-gate'

/**
 * GET /api/quotes/b2b
 * List all B2B quotes (single store since migration 270)
 * Explicitly scoped to the authenticated user's tenant
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
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied

    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Filters
    const status = searchParams.get('status');
    const partnerId = searchParams.get('partner_id');
    const itineraryId = searchParams.get('itinerary_id');

    // Build query - explicitly scoped to the authenticated user's tenant
    let query = supabase
      .from('b2b_quotes')
      .select(`
        *,
        b2b_partners (
          id,
          company_name,
          partner_code,
          contact_name,
          email
        ),
        itineraries (
          id,
          itinerary_code,
          trip_name,
          start_date,
          end_date,
          total_days
        )
      `, { count: 'exact' })
      .eq('tenant_id', authResult.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (partnerId) {
      query = query.eq('partner_id', partnerId);
    }
    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId);
    }

    const { data: quotes, error, count } = await query;

    if (error) {
      console.error('Error fetching B2B quotes:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      quotes,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error: any) {
    console.error('B2B quotes GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// No POST: creating a quote here stored every price the request sent, and
// nothing in the app called it. A B2B quote is made from the calculator (/api/b2b/quotes) or a trip (/api/b2b/quote-from-itinerary, /api/quotes/b2b/from-itinerary), which price it on the server.
