import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import Papa from 'papaparse'
import { parseTemplatesCsv } from '@/lib/tours/template-csv'

/**
 * POST /api/tours/bulk/import
 * Body: { csvData: string, dryRun?: boolean }
 *
 * Upserts this tenant's tour templates from a flat CSV, keyed on template_code.
 * Only the portable metadata is written; an existing template's itinerary,
 * hotels and variations are untouched. New codes are created as metadata
 * shells (itinerary built in the editor afterward). Used to receive the other
 * install's template export.
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

    const { records, refused, parseError } = parseTemplatesCsv(csvData, (csv) => {
      const p = Papa.parse<Record<string, string>>(csv, {
        header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim(),
      })
      return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
    })
    if (parseError) return NextResponse.json({ success: false, error: `CSV parsing failed: ${parseError}` }, { status: 400 })
    if (records.length === 0) return NextResponse.json({ success: false, error: 'No valid template rows found', refused }, { status: 400 })

    const db = supabase.from('tour_templates') as unknown as {
      select(c: string): { in(k: string, v: string[]): { eq(k: string, v: string): PromiseLike<{ data: Array<{ template_code: string }> | null }> } }
      insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>
      update(row: Record<string, unknown>): { eq(k: string, v: string): { eq(k: string, v: string): PromiseLike<{ error: { message: string } | null }> } }
    }

    const codes = records.map(r => r.template_code)
    const { data: existing } = await db.select('template_code').in('template_code', codes).eq('tenant_id', tenant_id)
    const existingCodes = new Set((existing || []).map(r => r.template_code))

    const preview = {
      totalRows: records.length + refused.length,
      willCreate: records.filter(r => !existingCodes.has(r.template_code)).length,
      willUpdate: records.filter(r => existingCodes.has(r.template_code)).length,
      refusedRows: refused.length,
      refused,
    }
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...preview })

    let created = 0, updated = 0
    const errors: Array<{ code: string; message: string }> = []
    for (const rec of records) {
      if (existingCodes.has(rec.template_code)) {
        const { error } = await db.update(rec as unknown as Record<string, unknown>).eq('template_code', rec.template_code).eq('tenant_id', tenant_id)
        if (error) errors.push({ code: rec.template_code, message: error.message })
        else updated++
      } else {
        const { error } = await db.insert({ ...rec, tenant_id })
        if (error) errors.push({ code: rec.template_code, message: error.message })
        else created++
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      ...(errors.length ? { error: `Import failed for ${errors.length} row(s): ${errors[0].message}` } : {}),
      created, updated, refusedRows: refused.length, refused, errors,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Import failed: ${error?.message || 'Unknown error'}` }, { status: 500 })
  }
}
