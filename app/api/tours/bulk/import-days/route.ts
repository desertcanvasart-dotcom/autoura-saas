import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import Papa from 'papaparse'
import { parseDaysCsv } from '@/lib/tours/itinerary-csv'
import { summarizeMeals } from '@/lib/tours/day-meals'

/**
 * POST /api/tours/bulk/import-days
 * Body: { csvData: string, dryRun?: boolean }
 *
 * Writes tour_templates.itinerary from a one-row-per-day sheet.
 *
 * REPLACES, per template. The itinerary is a single JSONB value, not a table
 * of rows, so "update day 2 and leave the rest" is not something the storage
 * can express honestly. Templates the sheet does not mention are untouched;
 * the parser refuses any template whose days are not a contiguous 1..N run, so
 * a truncated sheet is an error rather than a silent deletion.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { csvData, dryRun = false } = body
    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }

    const { byTemplate, refused, exampleRows, ignoredHeaders, parseError, headerError } = parseDaysCsv(
      csvData,
      (csv) => {
        const p = Papa.parse<Record<string, string>>(csv, {
          header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim(),
        })
        return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
      },
    )

    if (parseError) return NextResponse.json({ success: false, error: `CSV parsing failed: ${parseError}` }, { status: 400 })
    if (headerError) return NextResponse.json({ success: false, error: headerError }, { status: 400 })

    if (byTemplate.size === 0 && refused.length === 0 && exampleRows > 0) {
      return NextResponse.json({
        success: false,
        error: `Every row still has the sample Template Code (EXAMPLE-…). Put your own tour code in the Template Code column, then import again.`,
        exampleRows, refused: [],
      }, { status: 400 })
    }

    const codes = [...byTemplate.keys()]
    if (codes.length === 0) {
      return NextResponse.json({
        success: false,
        error: refused.length ? `No days could be imported. ${refused[0].reason}` : 'No valid day rows found',
        refused, exampleRows,
      }, { status: 400 })
    }

    const db = supabase.from('tour_templates') as unknown as {
      select(c: string): { in(k: string, v: string[]): { eq(k: string, v: string): PromiseLike<{ data: Array<{ template_code: string }> | null }> } }
      update(row: Record<string, unknown>): { eq(k: string, v: string): { eq(k: string, v: string): PromiseLike<{ error: { message: string } | null }> } }
    }

    // A days sheet never CREATES a tour: a day belongs to a template, and
    // inventing an empty one from a day row would hide a mistyped code.
    const { data: existing } = await db.select('template_code').in('template_code', codes).eq('tenant_id', tenant_id)
    const known = new Set((existing || []).map(r => r.template_code))
    const unknown = codes.filter(c => !known.has(c))
    for (const c of unknown) {
      refused.push({ row: 0, reason: `"${c}": no tour with this code in this workspace — import the tour itself first` })
    }

    const willUpdate = codes.filter(c => known.has(c))
    const preview = {
      templates: willUpdate.length,
      days: willUpdate.reduce((n, c) => n + (byTemplate.get(c)?.length ?? 0), 0),
      refusedRows: refused.length,
      refused, exampleRows, ignoredHeaders,
    }
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...preview })

    let updated = 0, days = 0
    const errors: Array<{ code: string; message: string }> = []
    for (const code of willUpdate) {
      const itinerary = byTemplate.get(code)!
      // meals_included is derived from the days it summarises, in the same
      // write, so the two can never disagree.
      const { error } = await db
        .update({ itinerary, meals_included: summarizeMeals(itinerary) })
        .eq('template_code', code)
        .eq('tenant_id', tenant_id)
      if (error) errors.push({ code, message: error.message })
      else { updated++; days += itinerary.length }
    }

    return NextResponse.json({
      success: errors.length === 0,
      ...(errors.length ? { error: `Day import failed for ${errors.length} tour(s): ${errors[0].message}` } : {}),
      updated, days, refusedRows: refused.length, refused, exampleRows, ignoredHeaders, errors,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: `Day import failed: ${message}` }, { status: 500 })
  }
}
