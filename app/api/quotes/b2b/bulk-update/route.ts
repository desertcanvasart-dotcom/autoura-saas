import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-server';

/**
 * PUT /api/quotes/b2b/bulk-update
 * Bulk update B2B quotes
 * RLS policies will automatically filter to user's tenant
 */
export async function PUT(request: NextRequest) {
  try {
    // Use authenticated client - RLS will enforce tenant isolation
    const supabase = await createAuthenticatedClient();

    const body = await request.json();
    const { quote_ids, status } = body;

    if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'quote_ids array is required' },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: 'status is required' },
        { status: 400 }
      );
    }

    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('b2b_quotes')
      .update(updateData)
      .in('id', quote_ids)
      .select('id');

    if (error) {
      console.error('Error bulk updating B2B quotes:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated_count: data?.length || 0,
      message: `Successfully updated ${data?.length || 0} quote(s)`
    });

  } catch (error: any) {
    console.error('B2B bulk update error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
