import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-server';

/**
 * GET /api/quotes/[type]/[id]/versions
 * List all versions for a quote
 */
export async function GET(
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

    // Use authenticated client - RLS will filter by tenant
    const supabase = await createAuthenticatedClient();

    // Fetch all versions for this quote
    const { data: versions, error } = await supabase
      .from('quote_versions')
      .select(`
        id,
        version_number,
        is_current,
        changed_by,
        changed_at,
        change_reason,
        change_summary,
        changes_diff,
        users:changed_by (email)
      `)
      .eq('quote_type', type)
      .eq('quote_id', id)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('Error fetching quote versions:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      versions: versions || [],
      total_versions: versions?.length || 0
    });

  } catch (error: any) {
    console.error('Quote versions API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
