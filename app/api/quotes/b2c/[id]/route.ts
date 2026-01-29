import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient, createAdminClient, requireAuth } from '@/lib/supabase-server';

/**
 * GET /api/quotes/b2c/[id]
 * Get a single B2C quote by ID
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
      .from('b2c_quotes')
      .select(`
        *,
        clients (
          id,
          full_name,
          email,
          phone,
          nationality,
          language
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
          { success: false, error: 'Quote not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching B2C quote:', error);
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
    console.error('B2C quote GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/quotes/b2c/[id]
 * Update a B2C quote
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
    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      );
    }
    const { id } = await params;
    const body = await request.json();

    // Extract updatable fields
    const {
      num_travelers,
      tier,
      currency,
      total_cost,
      margin_percent,
      selling_price,
      price_per_person,
      cost_breakdown,
      status,
      valid_until,
      internal_notes,
      client_notes,
      sent_via,
      sent_at,
      viewed_at,
      pdf_url
    } = body;

    const updateData: any = {};

    // Pricing fields
    if (num_travelers !== undefined) updateData.num_travelers = num_travelers;
    if (tier !== undefined) updateData.tier = tier;
    if (currency !== undefined) updateData.currency = currency;

    // If we have total_cost and margin_percent, recalculate selling_price and price_per_person
    let finalTotalCost = total_cost;
    let finalMarginPercent = margin_percent;
    let finalSellingPrice = selling_price;
    let finalPricePerPerson = price_per_person;
    let finalNumTravelers = num_travelers;

    // If total_cost or margin_percent is provided, recalculate
    if (total_cost !== undefined || margin_percent !== undefined) {
      // Fetch current values if not provided (using authenticated client)
      if (finalTotalCost === undefined || finalMarginPercent === undefined || finalNumTravelers === undefined) {
        const { data: currentQuote } = await supabase
          .from('b2c_quotes')
          .select('total_cost, margin_percent, num_travelers')
          .eq('id', id)
          .single();

        if (currentQuote) {
          finalTotalCost = total_cost !== undefined ? total_cost : currentQuote.total_cost;
          finalMarginPercent = margin_percent !== undefined ? margin_percent : currentQuote.margin_percent;
          finalNumTravelers = num_travelers !== undefined ? num_travelers : currentQuote.num_travelers;
        }
      }

      // Recalculate selling price: cost + (cost * margin / 100)
      finalSellingPrice = finalTotalCost * (1 + finalMarginPercent / 100);
      finalPricePerPerson = finalSellingPrice / finalNumTravelers;

      updateData.selling_price = finalSellingPrice;
      updateData.price_per_person = finalPricePerPerson;
    } else {
      // Use provided values if no recalculation needed
      if (selling_price !== undefined) updateData.selling_price = selling_price;
      if (price_per_person !== undefined) updateData.price_per_person = price_per_person;
    }

    if (total_cost !== undefined) updateData.total_cost = total_cost;
    if (margin_percent !== undefined) updateData.margin_percent = margin_percent;
    if (cost_breakdown !== undefined) updateData.cost_breakdown = cost_breakdown;

    // Metadata fields
    if (status !== undefined) updateData.status = status;
    if (valid_until !== undefined) updateData.valid_until = valid_until;
    if (internal_notes !== undefined) updateData.internal_notes = internal_notes;
    if (client_notes !== undefined) updateData.client_notes = client_notes;
    if (sent_via !== undefined) updateData.sent_via = sent_via;
    if (sent_at !== undefined) updateData.sent_at = sent_at;
    if (viewed_at !== undefined) updateData.viewed_at = viewed_at;
    if (pdf_url !== undefined) updateData.pdf_url = pdf_url;

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString();

    const { data: quote, error } = await supabase
      .from('b2c_quotes')
      .update(updateData)
      .eq('id', id)
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
          trip_name
        )
      `)
      .single();

    if (error) {
      console.error('Error updating B2C quote:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Create a version snapshot after successful update
    try {
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin.rpc('create_b2c_quote_version', {
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
    console.error('B2C quote UPDATE error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/quotes/b2c/[id]
 * Delete a B2C quote
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
      .from('b2c_quotes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting B2C quote:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Quote deleted successfully'
    });

  } catch (error: any) {
    console.error('B2C quote DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
