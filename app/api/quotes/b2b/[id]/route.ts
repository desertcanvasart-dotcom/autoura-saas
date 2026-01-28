import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient, createAdminClient, requireAuth } from '@/lib/supabase-server';

/**
 * GET /api/quotes/b2b/[id]
 * Get a single B2B quote by ID
 * RLS policies will enforce tenant isolation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Use authenticated client - RLS will enforce tenant isolation
    const supabase = await createAuthenticatedClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { data: quote, error } = await supabase
      .from('b2b_quotes')
      .select(`
        *,
        b2b_partners (
          id,
          company_name,
          partner_code,
          contact_name,
          email,
          phone,
          country
        ),
        itineraries (
          id,
          itinerary_code,
          trip_name,
          start_date,
          end_date,
          total_days,
          num_adults,
          num_children,
          package_type,
          itinerary_days (
            *
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'B2B Quote not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching B2B quote:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      quote
    });

  } catch (error: any) {
    console.error('B2B quote GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/quotes/b2b/[id]
 * Update a B2B quote
 * RLS policies will enforce tenant isolation
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication to get user info for versioning
    const authResult = await requireAuth();
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      );
    }

    const { supabase, user } = authResult;
    const { id } = await params;
    const body = await request.json();

    // Build update data from body
    const updateData: any = { updated_at: new Date().toISOString() };

    // Pricing configuration
    if (body.tier !== undefined) updateData.tier = body.tier;
    if (body.tour_leader_included !== undefined) updateData.tour_leader_included = body.tour_leader_included;
    if (body.currency !== undefined) updateData.currency = body.currency;

    // PPD breakdown
    if (body.ppd_accommodation !== undefined) updateData.ppd_accommodation = body.ppd_accommodation;
    if (body.ppd_cruise !== undefined) updateData.ppd_cruise = body.ppd_cruise;
    if (body.single_supplement !== undefined) updateData.single_supplement = body.single_supplement;

    // Fixed costs
    if (body.fixed_transport !== undefined) updateData.fixed_transport = body.fixed_transport;
    if (body.fixed_guide !== undefined) updateData.fixed_guide = body.fixed_guide;
    if (body.fixed_other !== undefined) updateData.fixed_other = body.fixed_other;

    // Per-person costs
    if (body.pp_entrance_fees !== undefined) updateData.pp_entrance_fees = body.pp_entrance_fees;
    if (body.pp_meals !== undefined) updateData.pp_meals = body.pp_meals;
    if (body.pp_tips !== undefined) updateData.pp_tips = body.pp_tips;
    if (body.pp_domestic_flights !== undefined) updateData.pp_domestic_flights = body.pp_domestic_flights;

    // Pricing table
    if (body.pricing_table !== undefined) updateData.pricing_table = body.pricing_table;
    if (body.tour_leader_cost !== undefined) updateData.tour_leader_cost = body.tour_leader_cost;

    // Status and validity
    if (body.status !== undefined) updateData.status = body.status;
    if (body.valid_from !== undefined) updateData.valid_from = body.valid_from;
    if (body.valid_until !== undefined) updateData.valid_until = body.valid_until;
    if (body.season !== undefined) updateData.season = body.season;

    // Notes
    if (body.internal_notes !== undefined) updateData.internal_notes = body.internal_notes;
    if (body.terms_and_conditions !== undefined) updateData.terms_and_conditions = body.terms_and_conditions;

    // PDF
    if (body.pdf_url !== undefined) updateData.pdf_url = body.pdf_url;

    const { data: quote, error } = await supabase
      .from('b2b_quotes')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        b2b_partners (
          id,
          company_name,
          partner_code
        ),
        itineraries (
          id,
          itinerary_code,
          trip_name
        )
      `)
      .single();

    if (error) {
      console.error('Error updating B2B quote:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Create a version snapshot after successful update
    try {
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin.rpc('create_b2b_quote_version', {
        p_quote_id: id,
        p_changed_by: user?.id,
        p_change_reason: body.change_reason || 'Quote updated'
      });
    } catch (versionError: any) {
      console.error('Error creating quote version:', versionError);
      // Don't fail the request if versioning fails, just log it
    }

    return NextResponse.json({
      success: true,
      quote
    });

  } catch (error: any) {
    console.error('B2B quote UPDATE error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/quotes/b2b/[id]
 * Delete a B2B quote
 * Note: RLS policy requires 'manager' role or higher
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Use authenticated client - RLS will enforce tenant isolation and role permission
    const supabase = await createAuthenticatedClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { error } = await supabase
      .from('b2b_quotes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting B2B quote:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'B2B quote deleted successfully'
    });

  } catch (error: any) {
    console.error('B2B quote DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
