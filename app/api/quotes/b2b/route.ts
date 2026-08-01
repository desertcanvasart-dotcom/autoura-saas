import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAdminClient } from '@/lib/supabase-server';

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

/**
 * POST /api/quotes/b2b
 * Create a new B2B quote (with pre-calculated pricing)
 * RLS policies will automatically validate tenant isolation
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
      partner_id,
      tier,
      tour_leader_included,
      currency,
      ppd_accommodation,
      ppd_cruise,
      single_supplement,
      fixed_transport,
      fixed_guide,
      fixed_other,
      pp_entrance_fees,
      pp_meals,
      pp_tips,
      pp_domestic_flights,
      pricing_table, // Multi-pax pricing table (required)
      tour_leader_cost,
      valid_from,
      valid_until,
      season,
      internal_notes,
      terms_and_conditions
    } = body;

    // Validation
    if (!tier || !pricing_table) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: tier, pricing_table' },
        { status: 400 }
      );
    }

    // Generate quote number using admin client (RPC needs admin)
    const { data: quoteNumber, error: seqError } = await (supabase as any)
      .rpc('generate_b2b_quote_number');

    if (seqError) {
      console.error('Error generating B2B quote number:', seqError);
      return NextResponse.json(
        { success: false, error: 'Failed to generate quote number' },
        { status: 500 }
      );
    }

    // Create B2B quote - tenant_id forced from the authenticated session
    const { data: quote, error: insertError } = await supabase
      .from('b2b_quotes')
      .insert({
        tenant_id: authResult.tenant_id,
        itinerary_id,
        partner_id,
        quote_number: quoteNumber,
        tier,
        tour_leader_included: tour_leader_included || false,
        currency: currency || 'EUR',
        ppd_accommodation: ppd_accommodation || 0,
        ppd_cruise: ppd_cruise || 0,
        single_supplement: single_supplement || 0,
        fixed_transport: fixed_transport || 0,
        fixed_guide: fixed_guide || 0,
        fixed_other: fixed_other || 0,
        pp_entrance_fees: pp_entrance_fees || 0,
        pp_meals: pp_meals || 0,
        pp_tips: pp_tips || 0,
        pp_domestic_flights: pp_domestic_flights || 0,
        pricing_table,
        tour_leader_cost: tour_leader_cost || 0,
        valid_from,
        valid_until,
        season,
        internal_notes,
        terms_and_conditions,
        status: 'draft'
      })
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
      `)
      .single();

    if (insertError) {
      console.error('Error creating B2B quote:', insertError);
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
    console.error('B2B quote creation error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
