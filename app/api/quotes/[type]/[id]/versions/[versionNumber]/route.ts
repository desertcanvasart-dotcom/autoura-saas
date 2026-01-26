import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-server';

/**
 * GET /api/quotes/[type]/[id]/versions/[versionNumber]
 * Get a specific version of a quote with full data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string; versionNumber: string }> }
) {
  try {
    const { type, id, versionNumber } = await params;

    // Validate quote type
    if (type !== 'b2c' && type !== 'b2b') {
      return NextResponse.json(
        { success: false, error: 'Invalid quote type. Must be b2c or b2b' },
        { status: 400 }
      );
    }

    // Validate version number
    const versionNum = parseInt(versionNumber);
    if (isNaN(versionNum) || versionNum < 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid version number' },
        { status: 400 }
      );
    }

    // Use authenticated client - RLS will filter by tenant
    const supabase = await createAuthenticatedClient();

    // Fetch the specific version
    const { data: version, error } = await supabase
      .from('quote_versions')
      .select(`
        id,
        version_number,
        is_current,
        quote_data,
        changed_by,
        changed_at,
        change_reason,
        change_summary,
        changes_diff,
        users:changed_by (email)
      `)
      .eq('quote_type', type)
      .eq('quote_id', id)
      .eq('version_number', versionNum)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Version not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching quote version:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      version
    });

  } catch (error: any) {
    console.error('Quote version detail API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
