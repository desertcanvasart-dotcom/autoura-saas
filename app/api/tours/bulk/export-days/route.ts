import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { serializeDaysCsv } from '@/lib/tours/itinerary-csv'

/**
 * GET /api/tours/bulk/export-days
 *
 * One row per itinerary day, for every template this tenant has. The template
 * sheet cannot carry the days — a day has meals, attractions, a travel mode
 * and five service flags, and nesting that in a cell makes a file nobody can
 * edit. Same split as the supplier properties sheet (#402).
 */
export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { data, error } = await (supabase
      .from('tour_templates') as unknown as {
        select(c: string): { eq(k: string, v: string): { order(c: string, o: { ascending: boolean }): PromiseLike<{ data: Array<{ template_code: string; itinerary: unknown }> | null; error: { message: string } | null }> } }
      })
      .select('template_code, itinerary')
      .eq('tenant_id', tenant_id)
      .order('template_code', { ascending: true })

    if (error) {
      return NextResponse.json({ success: false, error: `Failed to fetch templates: ${error.message}` }, { status: 500 })
    }

    return new NextResponse(serializeDaysCsv(data || []), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tour-days.csv"',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: `Export failed: ${message}` }, { status: 500 })
  }
}
