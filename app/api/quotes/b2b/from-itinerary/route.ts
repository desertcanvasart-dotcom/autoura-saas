import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient, createAdminClient } from '@/lib/supabase-server';

/**
 * POST /api/quotes/b2b/from-itinerary
 * Create a B2B quote with multi-pax pricing from an existing itinerary
 *
 * This endpoint generates PPD (Per Person Double) + Single Supplement pricing
 * with a multi-pax pricing table (typically 2-30 passengers).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      itinerary_id,
      partner_id,
      tier,
      tour_leader_included = false,
      currency = 'EUR',
      pax_counts = [2, 4, 6, 8, 10, 12, 15, 20, 25, 30], // Standard B2B pax counts
      valid_from,
      valid_until,
      season
    } = body;

    // Validation
    if (!itinerary_id || !tier) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: itinerary_id, tier' },
        { status: 400 }
      );
    }

    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    // 1. Fetch the itinerary with all services
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

    const services = itinerary.itinerary_services || [];
    const days = itinerary.itinerary_days || [];

    // 2. Categorize costs (fixed vs per-person)
    const fixedCosts = {
      transport: 0,
      guide: 0,
      other: 0
    };

    const perPersonCosts = {
      entrance_fees: 0,
      meals: 0,
      tips: 0,
      domestic_flights: 0
    };

    let accommodationCost = 0;  // Will calculate PPD from this
    let cruiseCost = 0;          // Cruise PPD

    // Analyze services
    services.forEach((service: any) => {
      const cost = parseFloat(service.total_cost || 0);

      switch (service.service_type) {
        case 'accommodation':
          accommodationCost += cost;
          break;
        case 'transportation':
        case 'transfer':
          fixedCosts.transport += cost;
          break;
        case 'guide':
          fixedCosts.guide += cost;
          break;
        case 'entrance_fee':
          perPersonCosts.entrance_fees += cost / (itinerary.num_adults + itinerary.num_children || 2);
          break;
        case 'meal':
          perPersonCosts.meals += cost / (itinerary.num_adults + itinerary.num_children || 2);
          break;
        case 'tip':
          perPersonCosts.tips += cost / (itinerary.num_adults + itinerary.num_children || 2);
          break;
        case 'flight':
          perPersonCosts.domestic_flights += cost / (itinerary.num_adults + itinerary.num_children || 2);
          break;
        default:
          fixedCosts.other += cost;
      }
    });

    // 3. Calculate PPD (Per Person Double)
    const totalDays = itinerary.total_days || days.length || 1;
    const accommodationNights = Math.max(1, totalDays - 1); // Assuming nights = days - 1

    // PPD = total accommodation cost / number of people / nights
    // For simplicity, assuming double occupancy baseline (2 people)
    const baselinePax = 2;
    const ppd_accommodation = accommodationNights > 0
      ? accommodationCost / baselinePax / accommodationNights
      : 0;

    const ppd_cruise = 0; // Calculate from cruise_rates if needed

    // Single supplement (typically 50-100% of PPD)
    const single_supplement = ppd_accommodation * accommodationNights * 0.7; // 70% supplement

    // 4. Calculate tour leader cost (if included)
    // Tour leader gets: accommodation (PPD + single supplement) + their per-pax costs
    const tour_leader_cost = tour_leader_included
      ? (ppd_accommodation * accommodationNights) + single_supplement +
        perPersonCosts.entrance_fees +
        perPersonCosts.meals +
        perPersonCosts.tips +
        perPersonCosts.domestic_flights
      : 0;

    // 5. Generate multi-pax pricing table
    const pricing_table: Record<string, { pp: number; total: number }> = {};

    for (const pax of pax_counts) {
      // Calculate effective pax (with or without tour leader)
      const effectivePax = tour_leader_included ? pax + 1 : pax;
      const payingPax = pax; // Tour leader doesn't pay

      // Accommodation cost (PPD × effective pax × nights)
      const totalAccommodation = ppd_accommodation * effectivePax * accommodationNights;

      // Fixed costs distributed among paying pax
      const fixedPerPerson = (
        fixedCosts.transport +
        fixedCosts.guide +
        fixedCosts.other
      ) / payingPax;

      // Per-person variable costs
      const variablePerPerson =
        perPersonCosts.entrance_fees +
        perPersonCosts.meals +
        perPersonCosts.tips +
        perPersonCosts.domestic_flights;

      // Tour leader cost distributed among paying pax
      const tlCostPerPerson = tour_leader_included ? tour_leader_cost / payingPax : 0;

      // Total per person
      const pricePerPerson =
        (totalAccommodation / payingPax) +
        fixedPerPerson +
        variablePerPerson +
        tlCostPerPerson;

      // Round up to 2 decimals
      pricing_table[pax.toString()] = {
        pp: Math.ceil(pricePerPerson * 100) / 100,
        total: Math.ceil(pricePerPerson * payingPax * 100) / 100
      };
    }

    // 6. Generate quote number (requires admin client for RPC)
    const supabaseAdmin = createAdminClient()
    const { data: quoteNumber, error: seqError } = await supabaseAdmin
      .rpc('generate_b2b_quote_number');

    if (seqError) {
      console.error('Error generating B2B quote number:', seqError);
      return NextResponse.json(
        { success: false, error: 'Failed to generate quote number' },
        { status: 500 }
      );
    }

    // 7. Create the B2B quote
    const { data: quote, error: quoteError } = await supabase
      .from('b2b_quotes')
      .insert({
        tenant_id: itinerary.tenant_id,
        itinerary_id,
        partner_id,
        quote_number: quoteNumber,
        tier,
        tour_leader_included,
        currency,
        ppd_accommodation,
        ppd_cruise,
        single_supplement,
        fixed_transport: fixedCosts.transport,
        fixed_guide: fixedCosts.guide,
        fixed_other: fixedCosts.other,
        pp_entrance_fees: perPersonCosts.entrance_fees,
        pp_meals: perPersonCosts.meals,
        pp_tips: perPersonCosts.tips,
        pp_domestic_flights: perPersonCosts.domestic_flights,
        pricing_table,
        tour_leader_cost,
        valid_from: valid_from || new Date().toISOString().split('T')[0],
        valid_until: valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        season: season || 'Standard',
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

    if (quoteError) {
      console.error('Error creating B2B quote:', quoteError);
      return NextResponse.json(
        { success: false, error: quoteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      quote,
      calculation: {
        ppd_breakdown: {
          ppd_accommodation,
          ppd_cruise,
          single_supplement,
          accommodation_nights: accommodationNights
        },
        fixed_costs: fixedCosts,
        per_person_costs: perPersonCosts,
        tour_leader_cost,
        pricing_table
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('B2B quote from itinerary error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
