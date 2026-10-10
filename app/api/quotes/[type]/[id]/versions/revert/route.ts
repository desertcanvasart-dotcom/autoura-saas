import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireAuth } from '@/lib/supabase-server';

/**
 * POST /api/quotes/[type]/[id]/versions/revert
 * Revert a quote to a previous version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params;

    // Validate quote type
    if (type !== 'b2c' && type !== 'b2b') {
      return NextResponse.json(
        { success: false, error: 'Invalid quote type. Must be b2c or b2b' },
        { status: 400 }
      );
    }

    // Require authentication and check permissions
    const authResult = await requireAuth();
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user, role, tenant_id } = authResult;

    // Only managers and above can revert quotes
    if (!['owner', 'admin', 'manager'].includes(role || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Requires manager role or higher.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { version_number, revert_reason } = body;

    if (!version_number) {
      return NextResponse.json(
        { success: false, error: 'version_number is required' },
        { status: 400 }
      );
    }

    // Use admin client for RPC call
    const supabaseAdmin = createAdminClient();
    const tableName = type === 'b2c' ? 'b2c_quotes' : 'b2b_quotes';

    // The caller's own quote only. The revert functions find the version and
    // update by quote id alone, and run as the service role — so a manager could
    // revert ANY tenant's quote by its id and read it back in full (documents
    // audit, round 12).
    const { data: ownQuote, error: ownError } = await supabaseAdmin
      .from(tableName)
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();
    if (ownError) throw ownError;
    if (!ownQuote) {
      return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 });
    }

    // A booked quote keeps its price: the booking, its deposit and its
    // invoices were made from it. Reverting brought back an older price (and
    // status) under a live booking.
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_number')
      .eq('quote_id', id)
      .eq('quote_type', type)
      .eq('tenant_id', tenant_id)
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (booking) {
      return NextResponse.json(
        {
          success: false,
          error: `This quote is booked${booking.booking_number ? ` (${booking.booking_number})` : ''}: an older version can no longer be restored. Change the booking instead, or cancel it first.`,
        },
        { status: 409 }
      );
    }

    // Call the appropriate revert function based on quote type
    const functionName = type === 'b2c'
      ? 'revert_b2c_quote_to_version'
      : 'revert_b2b_quote_to_version';

    const { data: newVersionId, error: revertError } = await supabaseAdmin
      .rpc(functionName, {
        p_quote_id: id,
        p_version_number: version_number,
        p_reverted_by: user?.id,
        p_revert_reason: revert_reason || 'Reverted to previous version'
      });

    if (revertError) {
      console.error('Error reverting quote:', revertError);
      return NextResponse.json(
        { success: false, error: revertError.message },
        { status: 500 }
      );
    }

    // Fetch the updated quote (the caller's tenant's, as checked above)
    const { data: updatedQuote, error: fetchError } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single();

    if (fetchError) {
      console.error('Error fetching reverted quote:', fetchError);
    }

    return NextResponse.json({
      success: true,
      message: `Quote reverted to version ${version_number}`,
      new_version_id: newVersionId,
      updated_quote: updatedQuote
    });

  } catch (error: any) {
    console.error('Quote revert API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
