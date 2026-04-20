import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { RATE_TABLE_CONFIGS, validateImportData } from '@/lib/bulk-rate-service'
import type { ImportResult } from '@/lib/bulk-rate-service'
import Papa from 'papaparse'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { table, csvData, dryRun = false } = body

    if (!table || !RATE_TABLE_CONFIGS[table]) {
      return NextResponse.json({ success: false, error: `Invalid table. Supported: ${Object.keys(RATE_TABLE_CONFIGS).join(', ')}` }, { status: 400 })
    }
    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }

    const config = RATE_TABLE_CONFIGS[table]

    const parsed = Papa.parse<Record<string, string>>(csvData, {
      header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim(),
    })

    if (parsed.errors.length > 0) {
      return NextResponse.json({ success: false, error: 'CSV parsing failed', details: parsed.errors.slice(0, 10) }, { status: 400 })
    }

    const rows = parsed.data
    if (rows.length === 0) return NextResponse.json({ success: false, error: 'No data rows' }, { status: 400 })

    const preview = validateImportData(rows, config)
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...preview })
    if (preview.invalidRows > 0) return NextResponse.json({ success: false, error: `${preview.invalidRows} rows have errors`, ...preview })

    const importableColumns = config.columns.filter(c => !c.exportOnly)
    const uniqueKeyColumn = config.uniqueKey[0]

    const rowsToUpsert: Record<string, any>[] = []
    for (const row of rows) {
      const record: Record<string, any> = { tenant_id }
      for (const colDef of importableColumns) {
        const raw = (row[colDef.name] ?? '').trim()
        if (raw === '' || raw === 'null') continue
        switch (colDef.type) {
          case 'number': record[colDef.name] = Number(raw); break
          case 'boolean': record[colDef.name] = ['true', '1', 'yes'].includes(raw.toLowerCase()); break
          default: record[colDef.name] = raw
        }
      }
      rowsToUpsert.push(record)
    }

    let inserted = 0, updated = 0
    const importErrors: any[] = []
    const BATCH_SIZE = 50

    for (let i = 0; i < rowsToUpsert.length; i += BATCH_SIZE) {
      const batch = rowsToUpsert.slice(i, i + BATCH_SIZE)
      const keyValues = batch.map(r => r[uniqueKeyColumn]).filter(Boolean)

      let existingKeys = new Set<string>()
      if (keyValues.length > 0) {
        const { data: existing } = await supabase.from(table).select(uniqueKeyColumn).in(uniqueKeyColumn, keyValues)
        if (existing) existingKeys = new Set(existing.map((r: any) => r[uniqueKeyColumn]))
      }

      const toInsert = batch.filter(r => !r[uniqueKeyColumn] || !existingKeys.has(r[uniqueKeyColumn]))
      const toUpdate = batch.filter(r => r[uniqueKeyColumn] && existingKeys.has(r[uniqueKeyColumn]))

      if (toInsert.length > 0) {
        const { error } = await supabase.from(table).insert(toInsert)
        if (error) importErrors.push({ batch: Math.floor(i / BATCH_SIZE) + 1, operation: 'insert', message: error.message })
        else inserted += toInsert.length
      }

      for (const record of toUpdate) {
        const keyVal = record[uniqueKeyColumn]
        const updateData = { ...record }; delete updateData[uniqueKeyColumn]; delete updateData.tenant_id
        const { error } = await supabase.from(table).update(updateData).eq(uniqueKeyColumn, keyVal)
        if (error) importErrors.push({ row: `${uniqueKeyColumn}=${keyVal}`, message: error.message })
        else updated++
      }
    }

    return NextResponse.json({ success: importErrors.length === 0, totalRows: rows.length, validRows: preview.validRows, invalidRows: preview.invalidRows, inserted, updated, errors: importErrors })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
