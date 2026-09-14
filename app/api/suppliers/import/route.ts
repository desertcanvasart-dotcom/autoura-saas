import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { parseSuppliersCsv, splitAgainstExisting, resolveImportTypes } from '@/lib/suppliers/import-csv'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { planNamedProperties, type NamedPropertyEntry, type SupplierRef, type ExistingProperty } from '@/lib/suppliers/property-csv-plan'
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
    const supplierTypeVocab = await loadVocabulary(supabase, 'supplier_type')
    const behaviorOf = (key: string) => supplierTypeVocab.find(v => v.key === key)?.behavior ?? key
    const resolved = resolveImportTypes(parsed.records, supplierTypeVocab)
    const refused = [...parsed.refused, ...resolved.refused].sort((a, b) => a.row - b.row)
    // Existing suppliers (this tenant): an import CREATES, never updates the
    // supplier row. Their ids and ROLES are read too — a property may be topped
    // up onto one, and it is validated against what that supplier actually is,
    // not what this file claims.
    const { data: existing } = await supabase
      .from('suppliers')
      .select('id, name, supplier_code, type, types')
      .eq('tenant_id', tenant_id)
    const { toInsert: creatable, skippedExisting } = splitAgainstExisting(
      resolved.records,
      (existing ?? []).map(s => String(s.name ?? ''))
    )

    const rows: SupplierInsert[] = creatable.map(r => ({
      tenant_id,
      name: r.name,
      // company_name is NOT NULL and mirrors the legacy name column.
      company_name: r.name,
      // Carry the portable code so a fresh-tenant import creates suppliers the
      // rate CSVs can link to by code (undefined when the sheet has none).
      ...(r.supplier_code ? { supplier_code: r.supplier_code } : {}),
      type: r.type,
      types: r.types,
      contact_name: r.contact_name,
      contact_email: r.contact_email,
      contact_phone: r.contact_phone,
      phone2: r.phone2,
      whatsapp: r.whatsapp,
      address: r.address,
      city: r.city,
      commission_type: r.commission_type,
      notes: r.notes,
      website: r.website,
      default_commission_rate: r.default_commission_rate,
      country: r.country || 'Egypt',
      status: r.status || 'active',
    }))

    let inserted = 0
    let createdSuppliers: Array<{ id: string; name: string; types: string[] }> = []
    if (rows.length > 0) {
      const { data, error } = await supabase.from('suppliers').insert(rows).select('id, name, type, types')
      if (error) {
        console.error('suppliers import insert failed:', error)
        return NextResponse.json({ success: false, error: `Insert failed: ${error.message}` }, { status: 500 })
      }
      createdSuppliers = (data ?? []).map(d => ({
        id: String(d.id),
        name: String(d.name),
        types: (Array.isArray(d.types) && d.types.length ? d.types : [d.type]).filter(Boolean).map(String),
      }))
      inserted = rows.length
    }

    // ---- The assets each supplier operates (the Properties column) ----
    // Every judgement lives in planNamedProperties (pure, tested): which kinds
    // a supplier's roles allow, refusing to guess between two, naming a prefix
    // that is not a kind. It TOPS UP — a property the supplier already has is
    // left alone, one it lacks is created, whether the supplier arrived in this
    // file or was already here.
    const asRef = (row: { id: unknown; name: unknown; supplier_code?: unknown; type?: unknown; types?: unknown }): SupplierRef => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      supplier_code: row.supplier_code ? String(row.supplier_code) : null,
      types: (Array.isArray(row.types) && row.types.length ? row.types : [row.type])
        .filter(Boolean)
        .map(String),
    })
    const knownSuppliers: SupplierRef[] = [
      ...createdSuppliers.map(s => asRef({ id: s.id, name: s.name, types: s.types })),
      ...(existing ?? []).map(asRef),
    ]

    const entries: NamedPropertyEntry[] = resolved.records.flatMap(record =>
      (record.properties ?? []).map(p => ({
        row: record.row,
        supplierName: record.name,
        type: p.type,
        rawType: p.rawType,
        name: p.name,
      }))
    )

    // What those suppliers already own, so a top-up adds only what is missing.
    let existingProperties: ExistingProperty[] = []
    if (entries.length > 0 && knownSuppliers.length > 0) {
      const { data } = await supabase
        .from('supplier_properties')
        .select('id, supplier_id, property_type, name')
        .eq('tenant_id', tenant_id)
        .in('supplier_id', knownSuppliers.map(s => s.id))
      existingProperties = (data ?? []) as ExistingProperty[]
    }

    const propertyPlan = planNamedProperties({
      tenantId: tenant_id,
      entries,
      suppliers: knownSuppliers,
      existing: existingProperties,
      behaviorOf,
    })
    const propertyWarnings = propertyPlan.warnings

    let propertiesCreated = 0
    if (propertyPlan.creates.length > 0) {
      const { error } = await supabase.from('supplier_properties').insert(propertyPlan.creates as never)
      if (error) {
        // The suppliers are already in. Say what did not follow them rather
        // than reporting a success that is only partly true.
        propertyWarnings.push({ row: 0, reason: `Properties could not be saved: ${error.message}` })
      } else {
        propertiesCreated = propertyPlan.creates.length
      }
    }
    // Named but not created because the supplier already had them — reported so
    // "0 created" never reads as "something went wrong".
    const propertiesAlreadyPresent =
      entries.length - propertyPlan.creates.length - propertyWarnings.filter(w => w.row !== 0).length

    return NextResponse.json({
      success: true,
      totalRows: parsed.totalRows,
      inserted,
      skippedExisting,
      refused,
      typeDefaulted: parsed.typeDefaulted,
      propertiesCreated,
      propertiesAlreadyPresent,
      propertyWarnings,
    })
  } catch (error) {
    console.error('suppliers import error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
