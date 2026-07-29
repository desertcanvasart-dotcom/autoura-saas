import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { RATE_TABLE_CONFIGS, getExportHeaders } from '@/lib/bulk-rate-service'
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
    const headers = getExportHeaders(config)

    // Config keys are live table names; the guard above proves membership,
    // which the Record<string, ...> config type cannot express.
    const tableName = table as keyof Database['public']['Tables']

    // RLS automatically filters by tenant
    const { data, error } = await supabase
      .from(tableName)
      .select(headers.join(','))
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const csv = Papa.unparse(data || [], { columns: headers })

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
