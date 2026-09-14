// ============================================
// POST /api/suppliers/export — the suppliers CSV
// ============================================
// The export used to be built in the browser, in the page component, from a
// hardcoded list of 8 headers and a hand-rolled `"${v || ''}"` serialiser. It
// dropped the supplier's code, country, notes, website, phone 2, WhatsApp,
// address and commission type, it had no idea the supplier owned any
// PROPERTIES, and a supplier whose name contained a quote produced a broken
// file (2026-09-14).
//
// It lives here now because:
//   - properties are rows in another table, so the export needs the database;
//   - the column set is shared with the importer (lib/suppliers/csv-schema.ts)
//     and belongs next to it, not in a component;
//   - Papa.unparse quotes and escapes properly, which hand-built strings did not.
//
// The client still decides WHAT to export — it posts the ids of the rows its
// filters left on screen. Re-deriving the filter server-side would be a second
// implementation of the same rule, which is the very thing that caused this bug.
// No ids means the whole tenant.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import Papa from 'papaparse'
import {
  SUPPLIER_CSV_COLUMNS,
  SUPPLIER_CSV_HEADERS,
  SUPPLIER_EXPORT_SELECT,
  formatPropertiesCell,
} from '@/lib/suppliers/csv-schema'

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
    const ids: string[] | null = Array.isArray(body?.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === 'string')
      : null

    // The column list is built from the schema at runtime, so the typed client
    // cannot narrow the row shape — the same seam the rates bulk export uses.
    interface SupplierRow extends Record<string, unknown> { id: string }
    interface SupplierQuery extends PromiseLike<{ data: SupplierRow[] | null; error: { message: string } | null }> {
      eq(column: string, value: unknown): SupplierQuery
      in(column: string, values: unknown[]): SupplierQuery
      order(column: string): SupplierQuery
    }

    // RLS scopes to the tenant; the explicit filter keeps that true even if a
    // policy is ever loosened.
    let query = (supabase.from('suppliers') as unknown as {
      select(columns: string): SupplierQuery
    })
      .select(SUPPLIER_EXPORT_SELECT)
      .eq('tenant_id', tenant_id)
      .order('name')
    if (ids) {
      if (ids.length === 0) {
        return csv([])
      }
      query = query.in('id', ids)
    }
    const { data: suppliers, error } = await query
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // The assets each supplier operates, in ONE query keyed back onto the rows.
    // A separate lookup rather than a PostgREST embed: a missing relationship
    // must cost the Properties column, never the whole export.
    const bySupplier = new Map<string, { property_type: string; name: string }[]>()
    const supplierIds = (suppliers ?? []).map(s => s.id)
    if (supplierIds.length > 0) {
      const { data: properties } = await supabase
        .from('supplier_properties')
        .select('supplier_id, property_type, name')
        .in('supplier_id', supplierIds)
        .eq('tenant_id', tenant_id)
        .order('property_type')
        .order('name')
      for (const p of properties ?? []) {
        if (!p.supplier_id) continue
        const list = bySupplier.get(p.supplier_id) ?? []
        list.push({ property_type: String(p.property_type), name: String(p.name) })
        bySupplier.set(p.supplier_id, list)
      }
    }

    const rows = (suppliers ?? []).map(supplier => {
      const record: Record<string, unknown> = supplier
      // A supplier fills several roles (migration 340); older rows carry one.
      const types = Array.isArray(record.types) && record.types.length
        ? (record.types as string[])
        : [record.type as string].filter(Boolean)

      const cells: Record<string, string> = {}
      for (const column of SUPPLIER_CSV_COLUMNS) {
        cells[column.header] =
          column.field === 'type'
            ? types.join('|')
            : column.field === 'properties'
              ? formatPropertiesCell(bySupplier.get(supplier.id) ?? [])
              : stringify(record[column.field])
      }
      return cells
    })

    return csv(rows)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** Empty and zero are real values; null/undefined are the only blanks. */
function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join('|')
  return String(value)
}

function csv(rows: Record<string, string>[]): NextResponse {
  // Headers are always written, even for zero rows: a file with a header line
  // tells you the format, and an utterly blank file tells you nothing at the
  // one moment you most need to know it.
  const body = Papa.unparse(rows, { columns: [...SUPPLIER_CSV_HEADERS] })
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="suppliers_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
