import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { RATE_TABLE_CONFIGS, getExportHeaders, getTemplateHeaders, buildTemplateRow, exportCellValue } from '@/lib/bulk-rate-service'
import type { Database } from '@/types/database.types'
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
