import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import Papa from 'papaparse'
import {
  parseTemplatesCsv,
  resolveTemplateVocabulary,
  TEMPLATE_VOCAB_COLUMNS,
  type VocabChoice,
} from '@/lib/tours/template-csv'
import { loadVocabulary } from '@/lib/vocabulary-server'

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

    const { records: parsed, refused: parseRefused, exampleRows, ignoredHeaders, parseError, headerError } = parseTemplatesCsv(csvData, (csv) => {
      const p = Papa.parse<Record<string, string>>(csv, {
        header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim(),
      })
      return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
    })
    if (parseError) return NextResponse.json({ success: false, error: `CSV parsing failed: ${parseError}` }, { status: 400 })

    // A header problem is about the FILE, not a row. Reported on its own so it
    // cannot read as "your rows are missing a Code" when the rows are fine and
    // the column is simply named something else.
    if (headerError) return NextResponse.json({ success: false, error: headerError }, { status: 400 })

    // The sample sheet ships one row whose Code starts with EXAMPLE-, and that
    // row is skipped so uploading the sample unedited creates nothing. Filling
    // the sample in but leaving its Code alone therefore imported NOTHING and
    // said "No valid template rows found" with an empty refused list — no hint
    // that the Code column was the problem. Say exactly what happened.
    if (parsed.length === 0 && parseRefused.length === 0 && exampleRows > 0) {
      return NextResponse.json({
        success: false,
        error: exampleRows === 1
          ? 'That row still has the sample Code (EXAMPLE-REPLACE-THIS-CODE). Put your own tour code in the Code column, then import again.'
          : `All ${exampleRows} rows still have a sample Code (EXAMPLE-…). Put your own tour code in the Code column of each, then import again.`,
        exampleRows,
        refused: [],
      }, { status: 400 })
    }

    // Vocabulary columns hold KEYS, but a person filling the sheet in types the
    // LABELS they see on the form. Accept either, and refuse — by name — a
    // value that is in neither, rather than storing something no dropdown can
    // show. RLS scopes these reads to the caller's tenant.
    const choicesByKind: Record<string, VocabChoice[]> = {}
    for (const col of TEMPLATE_VOCAB_COLUMNS) {
      if (choicesByKind[col.kind]) continue
      choicesByKind[col.kind] = (await loadVocabulary(supabase, col.kind))
        .map(i => ({ key: i.key, label: i.label }))
    }
    const { records, refused: vocabRefused } = resolveTemplateVocabulary(parsed, choicesByKind)
    const refused = [...parseRefused, ...vocabRefused]

    if (records.length === 0) {
      return NextResponse.json({
        success: false,
        error: refused.length
          ? `No rows could be imported. ${refused[0].reason}`
          : 'No valid template rows found',
        exampleRows,
        refused,
      }, { status: 400 })
    }

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
      exampleRows,
      ignoredHeaders,
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
      created, updated, refusedRows: refused.length, refused, exampleRows, ignoredHeaders, errors,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Import failed: ${error?.message || 'Unknown error'}` }, { status: 500 })
  }
}
