import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAdminClient } from '@/lib/supabase-server';

/**
 * GET /api/quotes/b2c
 * List all B2C quotes (with pagination and filtering)
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

    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Filters
    const status = searchParams.get('status');
    const clientId = searchParams.get('client_id');
    const itineraryId = searchParams.get('itinerary_id');

    // Build query - explicitly scoped to the authenticated user's tenant
    let query = supabase
      .from('b2c_quotes')
      .select(`
        *,
        clients (
          id,
          full_name,
          email,
          phone
        ),
        itineraries (
          id,
          itinerary_code,
          trip_name,
          start_date,
          end_date
        )
      `, { count: 'exact' })
      .eq('tenant_id', authResult.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId);
    }

    const { data: quotes, error, count } = await query;

    if (error) {
      console.error('Error fetching B2C quotes:', error);
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
    console.error('B2C quotes GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// No POST: creating a quote here stored every price the request sent, and
// nothing in the app called it. A B2C quote is made from a trip (/api/quotes/b2c/from-itinerary, the pricing grid, the AI trip builder) and its price is worked out there.
