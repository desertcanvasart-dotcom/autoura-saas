// Onboarding catalog choice — how this tenant starts with the shared
// global catalog (the migration-seeded, tenant_id-NULL reference rates in
// the seven CATALOG_TABLES).
//
//   'shared' — keep the read-only global catalog merged into the Rates Hub
//             (the default every tenant starts with; flag stays true)
//   'import' — copy every global row into tenant-owned, EDITABLE rows, then
//             hide the global originals (flag off) so nothing shows twice
//   'clean'  — hide the global catalog entirely; the tenant seeds their own
//             rates from scratch (flag off)
//
// The copy runs on the service-role client: global rows are intentionally
// read-only to tenants (migration 259), so an RLS client could never clone
// them. Inserted copies carry the tenant's id, which RLS write policies
// accept. Import refuses to run once the tenant has any rows of their own
// in a catalog table — re-importing over customized data would duplicate it.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { CATALOG_TABLES } from '@/lib/catalog-scope'

const CHOICES = ['shared', 'import', 'clean'] as const
type Choice = (typeof CHOICES)[number]

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { tenant_id } = authResult
    if (!tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const body = await request.json()
    const choice = body?.choice as Choice
    if (!CHOICES.includes(choice)) {
      return NextResponse.json(
        { success: false, error: `choice must be one of: ${CHOICES.join(', ')}` },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    let copied: Record<string, number> | undefined

    if (choice === 'import') {
      // Refuse if the tenant already owns rows in any catalog table.
      for (const table of CATALOG_TABLES) {
        const { count, error } = await admin
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant_id)
        if (error) {
          return NextResponse.json(
            { success: false, error: `Pre-check failed on ${table}: ${error.message}` },
            { status: 500 }
          )
        }
        if ((count ?? 0) > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `You already have your own rates in ${table} — importing again would duplicate them. Manage rates in the Rates Hub instead.`,
            },
            { status: 409 }
          )
        }
      }

      copied = {}
      for (const table of CATALOG_TABLES) {
        const { data: globalRows, error: readError } = await admin
          .from(table)
          .select('*')
          .is('tenant_id', null)
        if (readError) {
          return NextResponse.json(
            { success: false, error: `Reading ${table} failed: ${readError.message}` },
            { status: 500 }
          )
        }
        if (!globalRows || globalRows.length === 0) {
          copied[table] = 0
          continue
        }
        const rows = (globalRows as Record<string, unknown>[]).map((r) => {
          const copy = { ...r }
          delete copy.id
          delete copy.created_at
          delete copy.updated_at
          return { ...copy, tenant_id }
        })
        const { error: insertError } = await admin.from(table).insert(rows)
        if (insertError) {
          // Partial imports are visible (some tables copied, this one not) —
          // surface exactly which table failed rather than pretending success.
          return NextResponse.json(
            {
              success: false,
              error: `Copying ${table} failed: ${insertError.message}. Tables copied so far: ${JSON.stringify(copied)}`,
            },
            { status: 500 }
          )
        }
        copied[table] = rows.length
      }
    }

    const useGlobalCatalog = choice === 'shared'
    // Update-then-verify: a bare update on a missing tenant_features row
    // matches nothing and reports no error — insert the row in that case.
    const { data: updatedRows, error: flagError } = await admin
      .from('tenant_features')
      .update({ use_global_catalog: useGlobalCatalog, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id)
      .select('tenant_id')
    if (flagError) {
      return NextResponse.json(
        { success: false, error: `Saving catalog preference failed: ${flagError.message}` },
        { status: 500 }
      )
    }
    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertError } = await admin
        .from('tenant_features')
        .insert({ tenant_id, use_global_catalog: useGlobalCatalog })
      if (insertError) {
        return NextResponse.json(
          { success: false, error: `Saving catalog preference failed: ${insertError.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true, choice, use_global_catalog: useGlobalCatalog, copied })
  } catch (error) {
    console.error('Onboarding catalog POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
