import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-server';

/**
 * DELETE /api/quotes/b2b/bulk-delete
 * Bulk delete B2B quotes
 * Note: RLS policy requires 'manager' role or higher
 */
export async function DELETE(request: NextRequest) {
  try {
    // Use authenticated client - RLS will enforce tenant isolation and role permission
    const supabase = await createAuthenticatedClient();

    const body = await request.json();
    const { quote_ids } = body;

    if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'quote_ids array is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('b2b_quotes')
      .delete()
      .in('id', quote_ids)
      .select('id');

    if (error) {
      console.error('Error bulk deleting B2B quotes:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted_count: data?.length || 0,
      message: `Successfully deleted ${data?.length || 0} quote(s)`
    });

  } catch (error: any) {
    console.error('B2B bulk delete error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
