import { NextRequest, NextResponse } from 'next/server';
import { quoteSeasonFor } from '@/lib/quotes/quote-season'
import { priceB2cQuote, b2cPriceInputError } from '@/lib/quotes/b2c-quote-price';
import { createAuthenticatedClient, createAdminClient, requireAuth } from '@/lib/supabase-server';
import { isQuoteStatus, quoteStatusError } from '@/lib/quotes/quote-status'

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
    if (authResult.error !== null) {
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

    // The selling price and price per person are worked out here from the
    // base cost, margin, travellers and currency — never taken from the body
    // (lib/quotes/b2c-quote-price). Any of the four changing reprices.
    if (total_cost !== undefined || margin_percent !== undefined || num_travelers !== undefined || currency !== undefined) {
      const { data: currentQuote } = await supabase
        .from('b2c_quotes')
        .select('total_cost, margin_percent, num_travelers, currency, itinerary_id')
        .eq('id', id)
        .eq('tenant_id', authResult.tenant_id)
        .maybeSingle();
      if (!currentQuote) {
        return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 });
      }
      const cost = total_cost !== undefined ? total_cost : currentQuote.total_cost;
      const margin = margin_percent !== undefined ? margin_percent : currentQuote.margin_percent;
      const inputError = b2cPriceInputError(cost, margin);
      if (inputError) {
        return NextResponse.json({ success: false, error: inputError }, { status: 400 });
      }
      // The departure's seasonal premium, from the trip's start date now —
      // an edit reprices it like the rest of the price.
      let departure: string | null = null;
      if (currentQuote.itinerary_id) {
        const { data: trip } = await supabase
          .from('itineraries')
          .select('start_date')
          .eq('id', currentQuote.itinerary_id)
          .eq('tenant_id', authResult.tenant_id)
          .maybeSingle();
        departure = trip?.start_date ?? null;
      }
      const season = await quoteSeasonFor(authResult.tenant_id, departure);
      Object.assign(updateData, priceB2cQuote({
        totalCost: cost,
        marginPercent: margin,
        travelers: num_travelers !== undefined ? num_travelers : currentQuote.num_travelers,
        currency: currency !== undefined ? currency : currentQuote.currency,
        seasonPercent: season.season_percent,
      }), { season_name: season.season_name, season_percent: season.season_percent });
      if (total_cost !== undefined) updateData.total_cost = Number(total_cost);
      if (margin_percent !== undefined) updateData.margin_percent = Number(margin_percent);
    }

    if (cost_breakdown !== undefined) updateData.cost_breakdown = cost_breakdown;

    // Metadata fields
    if (status !== undefined && !isQuoteStatus('b2c', status)) {
      return NextResponse.json({ success: false, error: quoteStatusError('b2c') }, { status: 400 });
    }
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
      .eq('tenant_id', authResult.tenant_id)
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
