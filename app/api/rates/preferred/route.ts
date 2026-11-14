import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { clearPreferredSiblings, describeScope, isPreferredTable, PREFERRED_SCOPES } from '@/lib/rates/preferred'

// ============================================
// POST /api/rates/preferred — the star toggle
// ============================================
// { table, id, preferred } → flags ONE row as the engine's default in its
// city/tier scope, clearing the flag on its siblings first so the
// one-per-scope index (migration 354) is never tripped from the UI.
// { table, ids, preferred } → the same for each row: a transport route's
// vehicle rows (migration 460) are starred together.

type Row = Record<string, unknown>
interface DynamicQuery {
  eq(column: string, value: unknown): DynamicQuery
  select(columns: string): DynamicQuery
  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }>
  single(): Promise<{ data: Row | null; error: { message: string } | null }>
}
interface DynamicClient {
  from(table: string): {
    select(columns: string): DynamicQuery
    update(values: Row): DynamicQuery
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { table, id, ids, preferred } = body as { table?: unknown; id?: unknown; ids?: unknown; preferred?: unknown }
    if (!isPreferredTable(table)) return NextResponse.json({ success: false, error: 'Unknown rate table' }, { status: 400 })
    // A transport route is one row per vehicle: its star is set on every row
    // (`ids`). Every other table stars one row (`id`).
    const targets: string[] = Array.isArray(ids)
      ? ids.filter((v): v is string => typeof v === 'string' && v !== '')
      : typeof id === 'string' && id ? [id] : []
    if (targets.length === 0) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    if (targets.length > 50) return NextResponse.json({ success: false, error: 'Too many rows at once' }, { status: 400 })
    if (typeof preferred !== 'boolean') return NextResponse.json({ success: false, error: 'preferred must be true or false' }, { status: 400 })

    const scope = PREFERRED_SCOPES[table]
    // The table is chosen at runtime from an allowlist, so the typed client's
    // per-table overloads cannot apply — a minimal structural view instead.
    const db = supabase as unknown as DynamicClient
    const rows: Row[] = []
    for (const target of targets) {
      const { data: row, error: readError } = await db
        .from(table)
        .select(['id', 'tenant_id', scope.nameColumn, ...scope.columns, ...(scope.listColumns ?? [])].join(', '))
        .eq('id', target)
        .eq('tenant_id', tenant_id)
        .maybeSingle()
      if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 })
      // Global catalog rows (tenant_id NULL) are read-only for tenants — a
      // preference on them is not the tenant's to set.
      if (!row) return NextResponse.json({ success: false, error: 'Rate not found in your workspace' }, { status: 404 })
      rows.push(row)
    }

    const written: Row[] = []
    for (const row of rows) {
      const rowId = String(row.id)
      if (preferred) {
        const cleared = await clearPreferredSiblings(supabase, table, tenant_id, row, rowId)
        if (cleared.error) return NextResponse.json({ success: false, error: cleared.error }, { status: 500 })
      }
      const { data, error } = await db
        .from(table)
        .update({ is_preferred: preferred, updated_at: new Date().toISOString() })
        .eq('id', rowId)
        .eq('tenant_id', tenant_id)
        .select('id, is_preferred')
        .single()
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      if (data) written.push(data)
    }

    return NextResponse.json({
      success: true,
      data: written.length === 1 ? written[0] : written,
      name: rows[0][scope.nameColumn] ?? null,
      scope: describeScope(table, rows[0]),
    })
  } catch (err) {
    console.error('[rates/preferred]', err)
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
