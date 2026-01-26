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

/**
 * DELETE /api/quotes/b2c/bulk-delete
 * Bulk delete B2C quotes
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
      .from('b2c_quotes')
      .delete()
      .in('id', quote_ids)
      .select('id');

    if (error) {
      console.error('Error bulk deleting B2C quotes:', error);
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
    console.error('B2C bulk delete error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
