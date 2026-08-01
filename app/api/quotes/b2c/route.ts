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

/**
 * POST /api/quotes/b2c
 * Create a new B2C quote
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const supabase = createAdminClient();

    const body = await request.json();
    const {
      itinerary_id,
      client_id,
      num_travelers,
      tier,
      total_cost,
      margin_percent,
      selling_price,
      price_per_person,
      currency,
      cost_breakdown,
      valid_until,
      internal_notes,
      client_notes
    } = body;

    // Validation
    if (!num_travelers || !tier || !total_cost || !margin_percent || !selling_price) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate quote number using admin client (RPC needs admin)
    const { data: quoteNumber, error: seqError } = await (supabase as any)
      .rpc('generate_b2c_quote_number');

    if (seqError) {
      console.error('Error generating quote number:', seqError);
      return NextResponse.json(
        { success: false, error: 'Failed to generate quote number' },
        { status: 500 }
      );
    }

    // Create quote - tenant_id forced from the authenticated session
    const { data: quote, error: insertError } = await supabase
      .from('b2c_quotes')
      .insert({
        tenant_id: authResult.tenant_id,
        itinerary_id,
        client_id,
        // Attribution (mig 269): the staff member creating the quote.
        created_by: authResult.user!.id,
        quote_number: quoteNumber,
        num_travelers,
        tier,
        total_cost,
        margin_percent,
        selling_price,
        price_per_person: price_per_person || (selling_price / num_travelers),
        currency: currency || 'EUR',
        cost_breakdown,
        valid_until,
        internal_notes,
        client_notes,
        status: 'draft'
      })
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
      `)
      .single();

    if (insertError) {
      console.error('Error creating B2C quote:', insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      quote
    }, { status: 201 });

  } catch (error: any) {
    console.error('B2C quote creation error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
