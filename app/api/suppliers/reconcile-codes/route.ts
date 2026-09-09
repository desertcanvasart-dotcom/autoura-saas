import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import Papa from 'papaparse'
import { planReconciliation, readIncomingRow, type ExistingSupplier } from '@/lib/suppliers/reconcile-codes'

/**
 * POST /api/suppliers/reconcile-codes
 * Body: { csvData: string, dryRun?: boolean }
 *
 * Phase 4 of the portable supplier_code work. Takes a supplier export from the
 * other install (columns Code/Name/Email/Phone/WhatsApp) and, for each row,
 * finds THIS tenant's matching supplier by email or phone and stamps the
 * portable code onto it — so the two installs share one code per supplier and
 * rate CSVs link automatically thereafter.
 *
 * dryRun returns the plan (match / already / ambiguous / no_match / conflict)
 * without writing; the real call stamps the confident single matches only and
 * leaves everything else for the operator to pair by hand.
 */
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
    const { csvData, dryRun = false } = body
    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }

    const parsed = Papa.parse<Record<string, string>>(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    })
    if (parsed.errors.length > 0) {
      return NextResponse.json({ success: false, error: 'CSV parsing failed', details: parsed.errors.slice(0, 10) }, { status: 400 })
    }

    const incoming = (parsed.data || []).map(readIncomingRow).filter((r) => r.code)
    if (incoming.length === 0) {
      return NextResponse.json({ success: false, error: 'No rows with a Code column were found' }, { status: 400 })
    }

    // This tenant's suppliers. Match on the current contact_* fields, falling
    // back to the legacy email/phone columns (migration 010 copied them once,
    // but older rows may still carry data only there).
    const { data: sup, error: supErr } = await supabase
      .from('suppliers')
      .select('id, company_name, contact_email, contact_phone, email, phone, supplier_code')
      .eq('tenant_id', tenant_id)
    if (supErr) {
      return NextResponse.json({ success: false, error: `Failed to load suppliers: ${supErr.message}` }, { status: 500 })
    }
    const existing: ExistingSupplier[] = (sup || []).map((s: any) => ({
      id: s.id,
      company_name: s.company_name,
      email: s.contact_email || s.email,
      phone: s.contact_phone || s.phone,
      supplier_code: s.supplier_code,
    }))

    const plan = planReconciliation(incoming, existing)

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, summary: plan.summary, rows: plan.rows })
    }

    // Apply: stamp the code onto the confident single matches only.
    let stamped = 0
    const applyErrors: Array<{ code: string; supplier_id: string; message: string }> = []
    for (const row of plan.rows) {
      if (row.status !== 'match') continue
      const { error } = await supabase
        .from('suppliers')
        .update({ supplier_code: row.code } as never)
        .eq('id', row.supplier_id)
        .eq('tenant_id', tenant_id)
      if (error) applyErrors.push({ code: row.code, supplier_id: row.supplier_id, message: error.message })
      else stamped++
    }

    return NextResponse.json({
      success: applyErrors.length === 0,
      dryRun: false,
      stamped,
      summary: plan.summary,
      applyErrors,
      // Everything not auto-stamped, so the operator can pair it by hand.
      unresolved: plan.rows.filter((r) => r.status === 'ambiguous' || r.status === 'no_match' || r.status === 'conflict'),
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Reconcile failed' }, { status: 500 })
  }
}
