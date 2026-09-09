import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { TEMPLATE_CSV_COLUMNS, serializeTemplatesCsv } from '@/lib/tours/template-csv'

/**
 * GET /api/tours/bulk/export
 *
 * This tenant's tour templates as a flat CSV of their portable metadata. The
 * nested itinerary/hotels/variations and the install-local UUID links are left
 * out — this is a summary sheet and the shape that moves between installs.
 */
export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const cols = TEMPLATE_CSV_COLUMNS.map(c => c.name).join(', ')
    const { data, error } = await (supabase
      .from('tour_templates') as unknown as {
        select(c: string): { eq(k: string, v: string): { order(c: string, o: { ascending: boolean }): PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> } }
      })
      .select(cols)
      .eq('tenant_id', tenant_id)
      .order('template_code', { ascending: true })

    if (error) {
      return NextResponse.json({ success: false, error: `Failed to fetch templates: ${error.message}` }, { status: 500 })
    }

    const csv = serializeTemplatesCsv(data || [])
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tour-templates-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Export failed: ${error?.message || 'Unknown error'}` }, { status: 500 })
  }
}
