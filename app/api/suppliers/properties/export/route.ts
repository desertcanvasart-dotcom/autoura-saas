// ============================================
// POST /api/suppliers/properties/export — every asset, one row each
// ============================================
// The suppliers CSV carries properties as names in a single cell, which is all
// a one-row-per-supplier sheet can honestly hold. This is the other shape: one
// row per property, every field on it, for editing in a spreadsheet and
// importing back (2026-09-14).
//
// Each row carries its Property ID so a RENAME survives the round-trip, and its
// supplier's portable CODE so the file still means something in another install.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import Papa from 'papaparse'
import {
  PROPERTY_CSV_COLUMNS,
  PROPERTY_CSV_HEADERS,
  PROPERTY_EXPORT_SELECT,
} from '@/lib/suppliers/property-csv-schema'

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

    const body = await request.json().catch(() => ({}))
    const supplierIds: string[] | null = Array.isArray(body?.supplierIds)
      ? body.supplierIds.filter((id: unknown): id is string => typeof id === 'string')
      : null

    interface PropertyRow extends Record<string, unknown> { supplier_id: string }
    interface Query extends PromiseLike<{ data: PropertyRow[] | null; error: { message: string } | null }> {
      eq(column: string, value: unknown): Query
      in(column: string, values: unknown[]): Query
      order(column: string): Query
    }

    let query = (supabase.from('supplier_properties') as unknown as { select(c: string): Query })
      .select(PROPERTY_EXPORT_SELECT)
      .eq('tenant_id', tenant_id)
      .order('property_type')
      .order('name')
    if (supplierIds) {
      if (supplierIds.length === 0) return csv([])
      query = query.in('supplier_id', supplierIds)
    }
    const { data: properties, error } = await query
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // The supplier each one hangs from, keyed back on. A separate lookup, not a
    // PostgREST embed: a missing relationship must cost the supplier's NAME,
    // never the whole export.
    const supplierById = new Map<string, { name: string; supplier_code: string | null }>()
    const ids = [...new Set((properties ?? []).map(p => p.supplier_id).filter(Boolean))]
    if (ids.length > 0) {
      const { data: suppliers } = await (supabase.from('suppliers') as unknown as {
        select(c: string): { in(c: string, v: string[]): { eq(c: string, v: string): PromiseLike<{ data: Array<{ id: string; name: string; supplier_code: string | null }> | null }> } }
      })
        .select('id, name, supplier_code')
        .in('id', ids)
        .eq('tenant_id', tenant_id)
      for (const s of suppliers ?? []) supplierById.set(s.id, { name: s.name, supplier_code: s.supplier_code })
    }

    const rows = (properties ?? []).map(property => {
      const supplier = supplierById.get(property.supplier_id)
      const cells: Record<string, string> = {}
      for (const column of PROPERTY_CSV_COLUMNS) {
        cells[column.header] =
          column.field === 'supplier_name'
            ? supplier?.name ?? ''
            : column.field === 'supplier_code'
              ? supplier?.supplier_code ?? ''
              : stringify(property[column.field])
      }
      return cells
    })

    return csv(rows)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function csv(rows: Record<string, string>[]): NextResponse {
  // Headers even for zero rows: a file that shows the format beats a blank one
  // at exactly the moment somebody needs to know the format.
  const body = Papa.unparse(rows, { columns: [...PROPERTY_CSV_HEADERS] })
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="supplier_properties_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
