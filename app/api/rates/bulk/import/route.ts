import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { RATE_TABLE_CONFIGS, validateImportData, isExampleRow, importRowKey, partitionImportRows, applyCanonicalAliases, deriveImportSeasons } from '@/lib/bulk-rate-service'
import type { ImportResult } from '@/lib/bulk-rate-service'
import Papa from 'papaparse'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
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

    // The config's tableName is dynamic; the typed client cannot narrow it.
    interface DynamicFilter extends PromiseLike<{ error: { message: string } | null }> {
      eq(c: string, v: unknown): DynamicFilter
    }
    interface DynamicTable {
      select(columns: string): {
        in(column: string, values: unknown[]): {
          eq(c: string, v: unknown): PromiseLike<{ data: Record<string, unknown>[] | null }>
        }
      }
      insert(rows: Record<string, unknown>[]): PromiseLike<{ error: { message: string } | null }>
      update(row: Record<string, unknown>): DynamicFilter
    }
    const dynTable = () => supabase.from(config.tableName as 'accommodation_rates') as unknown as DynamicTable

    const importableColumns = config.columns.filter(c => !c.exportOnly)
    // Matching uses the FULL natural key (config.uniqueKey), never just its
    // first column — single-column matching is how a second, legitimately
    // distinct rate silently replaced the first (A-item 5). The first key
    // column still identifies the template's example row.
    const uniqueKey = config.uniqueKey
    const uniqueKeyColumn = uniqueKey[0]

    const rowsToUpsert: Record<string, any>[] = []
    let exampleRowsSkipped = 0
    for (const row of rows) {
      // The downloaded template ships one filled-in example row. Skip it, so
      // the classic mistake -- filling in the sheet underneath and importing
      // the sample along with it -- cannot land a junk rate.
      if (isExampleRow(row[uniqueKeyColumn])) {
        exampleRowsSkipped++
        continue
      }

      const record: Record<string, any> = { tenant_id }
      for (const colDef of importableColumns) {
        const raw = (row[colDef.name] ?? '').trim()
        if (raw === '' || raw === 'null') continue
        switch (colDef.type) {
          case 'number': record[colDef.name] = Number(raw); break
          case 'boolean': record[colDef.name] = ['true', '1', 'yes'].includes(raw.toLowerCase()); break
          default: record[colDef.name] = colDef.name === 'rate_currency' ? raw.toUpperCase() : raw
        }
      }

      // The passport-split columns are no longer in the template, and this
      // route builds its own records rather than reusing validateImportData --
      // so the mirror has to happen HERE too, or a file written from the
      // current template lands priced for one passport and blank for the other.
      for (const colDef of importableColumns) {
        if (!colDef.mirrorFrom) continue
        if (record[colDef.name] == null && record[colDef.mirrorFrom] != null) {
          record[colDef.name] = record[colDef.mirrorFrom]
        }
      }

      // Heal the accommodation split-brain at the write boundary: fill both
      // column families and turn dated season columns into real periods.
      applyCanonicalAliases(table, record)
      deriveImportSeasons(table, record)

      rowsToUpsert.push(record)
    }

    // Two rows in the same file sharing one natural key: the second would
    // silently overwrite the first ("13 creates, 0 inserts"). Refuse them
    // row-wise with the collision named, import the rest.
    const partition = partitionImportRows(rowsToUpsert, uniqueKey)

    let inserted = 0, updated = 0
    const importErrors: any[] = partition.duplicates.map(d => ({
      row: uniqueKey.map(c => `${c}=${String(d.record[c])}`).join(', '),
      operation: 'refused',
      message: d.message,
    }))
    const BATCH_SIZE = 50

    for (let i = 0; i < partition.rows.length; i += BATCH_SIZE) {
      const batch = partition.rows.slice(i, i + BATCH_SIZE)
      const keyValues = batch.map(r => r[uniqueKeyColumn]).filter(Boolean)

      // Existence is checked on the FULL key, scoped to THIS tenant — the
      // old lookup matched one column with no tenant filter, so a
      // global-catalog row visible to the tenant classified the row as
      // "existing" and the tenant-scoped update then silently did nothing.
      const existingKeys = new Set<string>()
      if (keyValues.length > 0) {
        const { data: existing } = await dynTable()
          .select(uniqueKey.join(', '))
          .in(uniqueKeyColumn, keyValues)
          .eq('tenant_id', tenant_id)
        for (const row of existing ?? []) {
          const key = importRowKey(row, uniqueKey)
          if (key !== null) existingKeys.add(key)
        }
      }

      const keyOf = (r: Record<string, unknown>) => importRowKey(r, uniqueKey)
      const toInsert = batch.filter(r => { const k = keyOf(r); return k === null || !existingKeys.has(k) })
      const toUpdate = batch.filter(r => { const k = keyOf(r); return k !== null && existingKeys.has(k) })

      if (toInsert.length > 0) {
        const { error } = await dynTable().insert(toInsert)
        if (error) importErrors.push({ batch: Math.floor(i / BATCH_SIZE) + 1, operation: 'insert', message: error.message })
        else inserted += toInsert.length
      }

      for (const record of toUpdate) {
        const updateData = { ...record }
        for (const col of uniqueKey) delete updateData[col]
        delete updateData.tenant_id
        let updateQuery = dynTable().update(updateData).eq('tenant_id', tenant_id)
        for (const col of uniqueKey) updateQuery = updateQuery.eq(col, record[col])
        const { error } = await updateQuery
        if (error) importErrors.push({ row: uniqueKey.map(c => `${c}=${String(record[c])}`).join(', '), message: error.message })
        else updated++
      }
    }

    return NextResponse.json({ success: importErrors.length === 0, totalRows: rows.length, validRows: preview.validRows, invalidRows: preview.invalidRows, inserted, updated, refusedDuplicates: partition.duplicates.length, exampleRowsSkipped, errors: importErrors })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
