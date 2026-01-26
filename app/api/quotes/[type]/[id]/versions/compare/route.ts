import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-server';

/**
 * GET /api/quotes/[type]/[id]/versions/compare?from=1&to=2
 * Compare two versions of a quote
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params;
    const { searchParams } = new URL(request.url);
    const fromVersion = parseInt(searchParams.get('from') || '0');
    const toVersion = parseInt(searchParams.get('to') || '0');

    // Validate quote type
    if (type !== 'b2c' && type !== 'b2b') {
      return NextResponse.json(
        { success: false, error: 'Invalid quote type. Must be b2c or b2b' },
        { status: 400 }
      );
    }

    // Validate version numbers
    if (fromVersion < 1 || toVersion < 1) {
      return NextResponse.json(
        { success: false, error: 'Both from and to version numbers are required and must be >= 1' },
        { status: 400 }
      );
    }

    // Use authenticated client - RLS will filter by tenant
    const supabase = await createAuthenticatedClient();

    // Fetch both versions
    const { data: versions, error } = await supabase
      .from('quote_versions')
      .select('version_number, quote_data, changed_at, changed_by, users:changed_by (email)')
      .eq('quote_type', type)
      .eq('quote_id', id)
      .in('version_number', [fromVersion, toVersion])
      .order('version_number');

    if (error) {
      console.error('Error fetching versions for comparison:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (!versions || versions.length !== 2) {
      return NextResponse.json(
        { success: false, error: 'One or both versions not found' },
        { status: 404 }
      );
    }

    const [oldVersion, newVersion] = versions;

    // Calculate differences
    const differences = calculateDifferences(
      oldVersion.quote_data,
      newVersion.quote_data,
      type
    );

    return NextResponse.json({
      success: true,
      comparison: {
        from_version: fromVersion,
        to_version: toVersion,
        from_data: oldVersion,
        to_data: newVersion,
        differences,
        total_changes: differences.length
      }
    });

  } catch (error: any) {
    console.error('Quote version compare API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Calculate differences between two quote versions
 */
function calculateDifferences(
  oldData: any,
  newData: any,
  quoteType: string
): Array<{ field: string; label: string; old_value: any; new_value: any; changed: boolean }> {
  const differences = [];

  // Common fields for both B2C and B2B
  const commonFields = [
    { key: 'status', label: 'Status' },
    { key: 'currency', label: 'Currency' },
    { key: 'internal_notes', label: 'Internal Notes' },
    { key: 'valid_until', label: 'Valid Until' }
  ];

  // B2C specific fields
  const b2cFields = [
    { key: 'num_travelers', label: 'Number of Travelers' },
    { key: 'tier', label: 'Tier' },
    { key: 'total_cost', label: 'Total Cost' },
    { key: 'margin_percent', label: 'Margin %' },
    { key: 'selling_price', label: 'Selling Price' },
    { key: 'price_per_person', label: 'Price Per Person' },
    { key: 'cost_breakdown', label: 'Cost Breakdown' }
  ];

  // B2B specific fields
  const b2bFields = [
    { key: 'tier', label: 'Tier' },
    { key: 'tour_leader_included', label: 'Tour Leader Included' },
    { key: 'ppd_accommodation', label: 'PPD Accommodation' },
    { key: 'ppd_cruise', label: 'PPD Cruise' },
    { key: 'single_supplement', label: 'Single Supplement' },
    { key: 'fixed_transport', label: 'Fixed Transport' },
    { key: 'fixed_guide', label: 'Fixed Guide' },
    { key: 'fixed_other', label: 'Fixed Other' },
    { key: 'pp_entrance_fees', label: 'PP Entrance Fees' },
    { key: 'pp_meals', label: 'PP Meals' },
    { key: 'pp_tips', label: 'PP Tips' },
    { key: 'pp_domestic_flights', label: 'PP Domestic Flights' },
    { key: 'pricing_table', label: 'Pricing Table' },
    { key: 'tour_leader_cost', label: 'Tour Leader Cost' },
    { key: 'valid_from', label: 'Valid From' },
    { key: 'season', label: 'Season' }
  ];

  // Select fields based on quote type
  const fieldsToCompare = quoteType === 'b2c'
    ? [...commonFields, ...b2cFields]
    : [...commonFields, ...b2bFields];

  // Compare each field
  for (const field of fieldsToCompare) {
    const oldValue = oldData[field.key];
    const newValue = newData[field.key];

    // For objects/arrays, do deep comparison
    const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

    differences.push({
      field: field.key,
      label: field.label,
      old_value: oldValue,
      new_value: newValue,
      changed
    });
  }

  // Filter to only changed fields by default
  return differences.filter(d => d.changed);
}
