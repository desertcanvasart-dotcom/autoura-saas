import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-server';
import { attachChangerEmails } from '@/lib/quotes/attach-changer-emails';

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

    // Fetch all versions for this quote. changed_by references auth.users,
    // which PostgREST cannot embed — the old `users:changed_by (email)`
    // embed failed the whole query (see lib/quotes/attach-changer-emails).
    const { data: rawVersions, error } = await supabase
      .from('quote_versions')
      .select(`
        id,
        version_number,
        is_current,
        changed_by,
        changed_at,
        change_reason,
        change_summary,
        changes_diff
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

    const versions = await attachChangerEmails(supabase, rawVersions ?? []);

    return NextResponse.json({
      success: true,
      versions,
      total_versions: versions.length
    });

  } catch (error: any) {
    console.error('Quote versions API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
