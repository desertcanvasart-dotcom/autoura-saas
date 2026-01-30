import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Create authenticated Supabase client from request
async function createAuthenticatedClient() {
  const cookieStore = await cookies();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
      },
      global: {
        headers: {
          cookie: cookieStore.toString(),
        },
      },
    }
  );
}

// Lazy-initialized Supabase admin client (avoids build-time errors when env vars unavailable)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

/**
 * GET /api/quotes/b2c
 * List all B2C quotes (with pagination and filtering)
 */
export async function GET(request: NextRequest) {
  try {
    // Create authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Filters
    const status = searchParams.get('status');
    const clientId = searchParams.get('client_id');
    const itineraryId = searchParams.get('itinerary_id');

    // Build query - RLS policies will automatically filter by tenant_id
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
    // Create authenticated client - RLS will enforce tenant isolation
    const supabase = await createAuthenticatedClient();

    // Get user's tenant_id from their membership
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { success: false, error: 'User does not belong to any tenant' },
        { status: 403 }
      );
    }

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
    const { data: quoteNumber, error: seqError } = await getSupabaseAdmin()
      .rpc('generate_b2c_quote_number');

    if (seqError) {
      console.error('Error generating quote number:', seqError);
      return NextResponse.json(
        { success: false, error: 'Failed to generate quote number' },
        { status: 500 }
      );
    }

    // Create quote - RLS will automatically validate tenant_id
    const { data: quote, error: insertError } = await supabase
      .from('b2c_quotes')
      .insert({
        tenant_id: membership.tenant_id,
        itinerary_id,
        client_id,
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
