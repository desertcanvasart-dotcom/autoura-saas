// ============================================
// POST /api/suppliers/properties/import — the edit sheet, applied
// ============================================
// Unlike the suppliers import, this one UPDATES: it is an edit surface, and a
// spreadsheet round-trip whose changes did not take would be pointless. Every
// judgement lives in planPropertyCsv (pure, tested); this route does IO.
//
// It never DELETES. A property absent from the file is untouched — the export
// can be filtered to a few suppliers, and "absent means delete" would make a
// filtered export a wipe. Retiring one is Active = false.
//
// `dryRun` returns the same counts without writing, so the UI can show what a
// file would do before it does it.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import Papa from 'papaparse'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { propertyCsvHeaderMap } from '@/lib/suppliers/property-csv-schema'
import { planPropertyCsv, type PropertyCsvRow, type SupplierRef, type ExistingProperty } from '@/lib/suppliers/property-csv-plan'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const body = await request.json()
    const { csvData, dryRun = false } = body ?? {}
    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }

    const headerMap = propertyCsvHeaderMap()
    const parsed = Papa.parse<Record<string, string>>(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    })
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { success: false, error: `CSV parsing failed: ${parsed.errors[0].message}` },
        { status: 400 }
      )
    }
    if (parsed.data.length === 0) {
      return NextResponse.json({ success: false, error: 'No data rows' }, { status: 400 })
    }

    // Header → field, so a column the sheet spells differently still lands and
    // a column nobody understands is ignored rather than failing the file.
    const rows: PropertyCsvRow[] = parsed.data.map((raw, i) => {
      const row: PropertyCsvRow = { row: i + 2 }
      for (const [header, value] of Object.entries(raw)) {
        const field = headerMap[header]
        if (field) row[field] = value
      }
      return row
    })

    const [{ data: suppliers }, { data: existing }, supplierTypeVocab, accommodationVocab] = await Promise.all([
      supabase.from('suppliers').select('id, name, supplier_code, type, types').eq('tenant_id', tenant_id),
      supabase.from('supplier_properties').select('id, supplier_id, property_type, name').eq('tenant_id', tenant_id),
      loadVocabulary(supabase, 'supplier_type'),
      loadVocabulary(supabase, 'hotel_property_type'),
    ])

    const supplierRefs: SupplierRef[] = (suppliers ?? []).map(s => ({
      id: String(s.id),
      name: String(s.name ?? ''),
      supplier_code: s.supplier_code ? String(s.supplier_code) : null,
      // A supplier fills several roles (migration 340); older rows carry one.
      types: (Array.isArray(s.types) && s.types.length ? s.types : [s.type]).filter(Boolean).map(String),
    }))
    const behaviorOf = (key: string) => supplierTypeVocab.find(v => v.key === key)?.behavior ?? key

    const plan = planPropertyCsv({
      rows,
      tenantId: tenant_id,
      suppliers: supplierRefs,
      existing: (existing ?? []) as ExistingProperty[],
      behaviorOf,
      accommodationVocab,
    })

    const summary = {
      totalRows: rows.length,
      created: plan.creates.length,
      updated: plan.updates.length,
      refused: plan.refused,
    }
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...summary })

    const errors: Array<{ row: number; reason: string }> = [...plan.refused]
    let created = 0
    let updated = 0

    if (plan.creates.length > 0) {
      const { error } = await supabase.from('supplier_properties').insert(plan.creates as never)
      if (error) errors.push({ row: 0, reason: `New properties could not be saved: ${error.message}` })
      else created = plan.creates.length
    }

    for (const update of plan.updates) {
      const { error } = await supabase
        .from('supplier_properties')
        .update({ ...update.patch, updated_at: new Date().toISOString() } as never)
        .eq('id', update.id)
        .eq('tenant_id', tenant_id)
      if (error) errors.push({ row: 0, reason: `${String(update.patch.name ?? update.id)}: ${error.message}` })
      else updated++
    }

    return NextResponse.json({
      success: errors.length === 0,
      totalRows: rows.length,
      created,
      updated,
      refused: plan.refused,
      errors,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
