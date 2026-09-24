import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { RATE_TABLE_CONFIGS, getExportHeaders, getTemplateHeaders, buildTemplateRow, exportCellValue, propertyLinkFor } from '@/lib/bulk-rate-service'
import type { Database } from '@/types/database.types'
import { PERIODS_CSV_TABLES, periodsSheetHeaders, periodsSheetColumns, buildPeriodsSheetRows } from '@/lib/rates/periods-csv'
import { loadVocabulary } from '@/lib/vocabulary-server'
import Papa from 'papaparse'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const table = request.nextUrl.searchParams.get('table')
    if (!table || !RATE_TABLE_CONFIGS[table]) {
      return NextResponse.json({ success: false, error: `Invalid table. Supported: ${Object.keys(RATE_TABLE_CONFIGS).join(', ')}` }, { status: 400 })
    }

    const config = RATE_TABLE_CONFIGS[table]
    // `template=1` returns the headers plus one filled-in example row.
    // Without it, exporting an EMPTY rate table produced a completely blank
    // file — Papa returns "" for zero rows, headers and all — so the one
    // moment somebody most needs to know the format (their first import,
    // before any data exists) was the moment the system told them nothing.
    if (request.nextUrl.searchParams.get('template') === '1') {
      const csv = Papa.unparse({
        fields: getTemplateHeaders(config),
        data: [buildTemplateRow(config)],
      })
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${table}_template.csv"`,
        },
      })
    }

    // `format=periods` (hotels, cruises): one row per dated rate period — the
    // sheet the importer reads back losslessly. The flat sheet below is one
    // row per property and holds period 1 only; a hotel with five periods
    // exported as one (operator, 2026-09-24).
    if (request.nextUrl.searchParams.get('format') === 'periods') {
      const target = PERIODS_CSV_TABLES[table]
      if (!target) {
        return NextResponse.json({ success: false, error: `Rate periods export is for: ${Object.keys(PERIODS_CSV_TABLES).join(', ')}` }, { status: 400 })
      }
      interface PeriodQuery {
        select(columns: string): {
          order(column: string, opts: { ascending: boolean }): PromiseLike<{
            data: Record<string, unknown>[] | null
            error: { message: string } | null
          }>
        }
      }
      // RLS scopes the tenant.
      const { data, error } = await (supabase.from(config.tableName as 'accommodation_rates') as unknown as PeriodQuery)
        .select(periodsSheetColumns(target.entity, target.codeColumn, target.nameColumn).join(', '))
        .order(target.nameColumn, { ascending: true })
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      // The Season cell carries the agency's own word, which the importer
      // resolves back to the key.
      const vocab = await loadVocabulary(supabase, 'rate_season').catch(() => [])
      const labelByKey = new Map(vocab.map(v => [v.key, v.label]))
      const sheetRows = buildPeriodsSheetRows(
        data ?? [], target.entity, target.codeColumn, target.nameColumn,
        key => labelByKey.get(key) ?? key,
      )
      const fields = periodsSheetHeaders(target.entity)
      const csv = Papa.unparse({ fields, data: sheetRows.map(r => fields.map(h => r[h] ?? '')) })
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${table}_periods_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    }

    const headers = getExportHeaders(config)

    // Config keys are live table names; the guard above proves membership,
    // which the Record<string, ...> config type cannot express.
    // config.tableName, not the raw key: the fixed_costs config maps to the
    // fixed_daily_costs table.
    const tableName = config.tableName as keyof Database['public']['Tables']

    // RLS automatically filters by tenant.
    // select('*') + header mapping, never select(headers.join(',')): naming a
    // column the database does not have yet (e.g. rate_currency before
    // migration 295) would 500 the whole export.
    interface DynamicQuery {
      select(columns: string): {
        order(column: string, opts: { ascending: boolean }): PromiseLike<{
          data: Record<string, unknown>[] | null
          error: { message: string } | null
        }>
      }
    }
    const { data, error } = await (supabase.from(tableName) as unknown as DynamicQuery)
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // supplier_code lives on suppliers, not on the rate row, so fill it in by
    // joining: one RLS-scoped query for the codes of every supplier referenced
    // here, keyed back onto each row. This is what lets a rate exported here
    // re-link to a supplier in the sibling install by its portable code. A
    // separate lookup, not a PostgREST embed, so a table without a supplier FK
    // relationship can't fail the whole export.
    if (headers.includes('supplier_code')) {
      const supplierIds = [...new Set((data || []).map(r => r.supplier_id).filter(Boolean))] as string[]
      const codeById = new Map<string, string>()
      if (supplierIds.length > 0) {
        const { data: sup } = await (supabase
          .from('suppliers') as unknown as {
            select(c: string): { in(c: string, v: string[]): PromiseLike<{ data: Array<{ id: string; supplier_code: string | null }> | null }> }
          })
          .select('id, supplier_code')
          .in('id', supplierIds)
        for (const s of sup || []) if (s.supplier_code) codeById.set(s.id, s.supplier_code)
      }
      for (const row of data || []) {
        ;(row as Record<string, unknown>).supplier_code = row.supplier_id ? codeById.get(row.supplier_id as string) ?? '' : ''
      }
    }

    // The property behind the rate — WHICH train, WHICH ship. Hotels and
    // cruises spell it on the rate row already; trains keep it only on
    // supplier_properties, so without this join the exported file has no trace
    // of the train at all and a re-import cannot put it back (2026-09-14).
    // Separate lookup, not a PostgREST embed, for the same reason as the
    // supplier codes above: a missing FK must cost the name, never the export.
    const propertyLink = propertyLinkFor(table)
    if (propertyLink?.virtual) {
      const propertyIds = [...new Set((data || []).map(r => r.property_id).filter(Boolean))] as string[]
      const nameById = new Map<string, string>()
      if (propertyIds.length > 0) {
        const { data: props } = await (supabase
          .from('supplier_properties') as unknown as {
            select(c: string): { in(c: string, v: string[]): PromiseLike<{ data: Array<{ id: string; name: string }> | null }> }
          })
          .select('id, name')
          .in('id', propertyIds)
        for (const prop of props || []) nameById.set(prop.id, prop.name)
      }
      for (const row of data || []) {
        ;(row as Record<string, unknown>)[propertyLink.nameColumn] =
          row.property_id ? nameById.get(row.property_id as string) ?? '' : ''
      }
    }

    // exportCellValue reads a cell's column OR its alias partner, so a hotel
    // saved through the form (engine family only) exports real numbers.
    const rows = (data || []).map(row =>
      Object.fromEntries(headers.map(h => [h, exportCellValue(table, row, h) ?? '']))
    )
    const csv = Papa.unparse(rows, { columns: headers })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${table}_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
