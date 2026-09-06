import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { parseSuppliersCsv, splitAgainstExisting, resolveImportTypes } from '@/lib/suppliers/import-csv'
import { loadVocabulary } from '@/lib/vocabulary-server'
import type { Database } from '@/types/database.types'

type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']

// ============================================
// POST /api/suppliers/import — suppliers CSV import (B-item 7)
// ============================================
// Parsing/classification live in lib/suppliers/import-csv.ts (tested
// there). This route only authenticates, looks up the tenant's existing
// supplier names, and inserts what survives.

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
    if (!body.csvData || typeof body.csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }

    const parsed = parseSuppliersCsv(body.csvData)
    if (parsed.parseError) {
      return NextResponse.json({ success: false, error: parsed.parseError }, { status: 400 })
    }

    // Role words → the agency's vocabulary keys; an unknown word refuses its row.
    const resolved = resolveImportTypes(parsed.records, await loadVocabulary(supabase, 'supplier_type'))
    const refused = [...parsed.refused, ...resolved.refused].sort((a, b) => a.row - b.row)
    // Existing suppliers (this tenant): an import CREATES, never updates.
    const { data: existing } = await supabase.from('suppliers').select('name').eq('tenant_id', tenant_id)
    const { toInsert: creatable, skippedExisting } = splitAgainstExisting(
      resolved.records,
      (existing ?? []).map(s => String(s.name ?? ''))
    )

    const rows: SupplierInsert[] = creatable.map(r => ({
      tenant_id,
      name: r.name,
      // company_name is NOT NULL and mirrors the legacy name column.
      company_name: r.name,
      type: r.type,
      types: r.types,
      contact_name: r.contact_name,
      contact_email: r.contact_email,
      contact_phone: r.contact_phone,
      city: r.city,
      notes: r.notes,
      website: r.website,
      default_commission_rate: r.default_commission_rate,
      country: r.country || 'Egypt',
      status: r.status || 'active',
    }))

    let inserted = 0
    if (rows.length > 0) {
      const { error } = await supabase.from('suppliers').insert(rows)
      if (error) {
        console.error('suppliers import insert failed:', error)
        return NextResponse.json({ success: false, error: `Insert failed: ${error.message}` }, { status: 500 })
      }
      inserted = rows.length
    }

    return NextResponse.json({
      success: true,
      totalRows: parsed.totalRows,
      inserted,
      skippedExisting,
      refused,
      typeDefaulted: parsed.typeDefaulted,
    })
  } catch (error) {
    console.error('suppliers import error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
