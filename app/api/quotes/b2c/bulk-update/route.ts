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
 * PUT /api/quotes/b2c/bulk-update
 * Bulk update B2C quotes
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
      .from('b2c_quotes')
      .update(updateData)
      .in('id', quote_ids)
      .select('id');

    if (error) {
      console.error('Error bulk updating B2C quotes:', error);
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
    console.error('B2C bulk update error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
