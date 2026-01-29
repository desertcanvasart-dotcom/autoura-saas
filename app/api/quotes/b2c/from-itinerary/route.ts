import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient, createAdminClient } from '@/lib/supabase-server';

/**
 * POST /api/quotes/b2c/from-itinerary
 * Create a B2C quote from an existing itinerary
 *
 * This endpoint takes an itinerary and calculates B2C pricing
 * based on the number of travelers, tier, and margin percentage.
 */
export async function POST(request: NextRequest) {
  try {
    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const body = await request.json();
    const {
      itinerary_id,
      client_id,
      num_travelers,
      tier,
      margin_percent,
      currency,
      valid_until
    } = body;

    // Validation
    if (!itinerary_id || !num_travelers || !tier || !margin_percent) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: itinerary_id, num_travelers, tier, margin_percent' },
        { status: 400 }
      );
    }

    // 1. Fetch the itinerary with all its services
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select(`
        *,
        itinerary_days (*),
        itinerary_services (*)
      `)
      .eq('id', itinerary_id)
      .single();

    if (itinError || !itinerary) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      );
    }

    // 2. Calculate costs from services
    const services = itinerary.itinerary_services || [];

    // Group costs by type
    const costBreakdown: any = {
      accommodation: 0,
      transportation: 0,
      entrance_fees: 0,
      guide: 0,
      meals: 0,
      tips: 0,
      flights: 0,
      miscellaneous: 0
    };

    services.forEach((service: any) => {
      const cost = parseFloat(service.total_cost || 0);

      switch (service.service_type) {
        case 'accommodation':
          costBreakdown.accommodation += cost;
          break;
        case 'transportation':
        case 'transfer':
          costBreakdown.transportation += cost;
          break;
        case 'entrance_fee':
          costBreakdown.entrance_fees += cost;
          break;
        case 'guide':
          costBreakdown.guide += cost;
          break;
        case 'meal':
          costBreakdown.meals += cost;
          break;
        case 'tip':
          costBreakdown.tips += cost;
          break;
        case 'flight':
          costBreakdown.flights += cost;
          break;
        default:
          costBreakdown.miscellaneous += cost;
      }
    });

    // Calculate totals
    const total_cost = Object.values(costBreakdown).reduce((sum: number, val: any) => sum + val, 0);
    const margin_amount = total_cost * (margin_percent / 100);
    const selling_price = total_cost + margin_amount;
    const price_per_person = selling_price / num_travelers;

    // 3. Generate quote number (requires admin client for RPC)
    const supabaseAdmin = createAdminClient()
    const { data: quoteNumber, error: seqError } = await supabaseAdmin
      .rpc('generate_b2c_quote_number');

    if (seqError) {
      console.error('Error generating quote number:', seqError);
      return NextResponse.json(
        { success: false, error: 'Failed to generate quote number' },
        { status: 500 }
      );
    }

    // 4. Create the B2C quote
    const { data: quote, error: quoteError } = await supabase
      .from('b2c_quotes')
      .insert({
        tenant_id: itinerary.tenant_id,
        itinerary_id,
        client_id: client_id || itinerary.client_id,
        quote_number: quoteNumber,
        num_travelers,
        tier,
        total_cost,
        margin_percent,
        selling_price,
        price_per_person,
        currency: currency || 'EUR',
        cost_breakdown: costBreakdown,
        valid_until: valid_until || null,
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
          end_date,
          total_days
        )
      `)
      .single();

    if (quoteError) {
      console.error('Error creating B2C quote:', quoteError);
      return NextResponse.json(
        { success: false, error: quoteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      quote,
      calculation: {
        total_cost,
        margin_amount,
        margin_percent,
        selling_price,
        price_per_person,
        cost_breakdown: costBreakdown
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('B2C quote from itinerary error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
