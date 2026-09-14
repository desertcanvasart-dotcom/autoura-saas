import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { parseSuppliersCsv, splitAgainstExisting, resolveImportTypes } from '@/lib/suppliers/import-csv'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { propertyTypesForRoles, PROPERTY_TYPE_LABELS, type PropertyType } from '@/lib/supplier-properties'
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
    const resolved = resolveImportTypes(parsed.records, supplierTypeVocab)
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
    let createdSuppliers: Array<{ id: string; name: string }> = []
    if (rows.length > 0) {
      const { data, error } = await supabase.from('suppliers').insert(rows).select('id, name')
      if (error) {
        console.error('suppliers import insert failed:', error)
        return NextResponse.json({ success: false, error: `Insert failed: ${error.message}` }, { status: 500 })
      }
      createdSuppliers = (data ?? []).map(d => ({ id: String(d.id), name: String(d.name) }))
      inserted = rows.length
    }

    // ---- The assets each supplier operates (the Properties column) ----
    // Resolved HERE because this is where the supplier's new id and its roles
    // are both known. A property that cannot be placed is REPORTED and the
    // supplier still lands — the rate is never held hostage to its ship.
    const behaviorOf = (key: string) =>
      supplierTypeVocab.find(v => v.key === key)?.behavior ?? key
    const idByName = new Map(createdSuppliers.map(s => [s.name.trim().toLowerCase(), s.id]))
    const propertyRows: Array<{ tenant_id: string; supplier_id: string; property_type: PropertyType; name: string }> = []
    const propertyWarnings: Array<{ row: number; reason: string }> = []
    const seenProperty = new Set<string>()

    for (const record of creatable) {
      if (!record.properties?.length) continue
      const supplierId = idByName.get(record.name.trim().toLowerCase())
      if (!supplierId) continue // its insert did not land; nothing to hang them off
      // Which kinds of asset this supplier's ROLES allow it to own — the same
      // rule the Properties tab uses, so the sheet cannot create something the
      // UI would refuse to show.
      const allowed = propertyTypesForRoles(record.types.map(behaviorOf))

      for (const entry of record.properties) {
        if (entry.rawType && !entry.type) {
          propertyWarnings.push({
            row: record.row,
            reason: `"${record.name}": "${entry.rawType}" is not a kind of property — use ${Object.keys(PROPERTY_TYPE_LABELS).join(', ')}`,
          })
          continue
        }
        let type = entry.type
        if (!type) {
          // No prefix. One allowed kind is unambiguous; more than one is not,
          // and guessing would silently file a ship under hotels.
          if (allowed.length === 1) type = allowed[0]
          else {
            propertyWarnings.push({
              row: record.row,
              reason: allowed.length === 0
                ? `"${record.name}": its roles own no properties, so "${entry.name}" has nowhere to go`
                : `"${record.name}": say which kind "${entry.name}" is (${allowed.join(' or ')}:${entry.name}) — its roles allow more than one`,
            })
            continue
          }
        }
        if (!allowed.includes(type)) {
          propertyWarnings.push({
            row: record.row,
            reason: `"${record.name}": a ${record.types.join('/')} does not own a ${type} ("${entry.name}")`,
          })
          continue
        }
        // (supplier, type, name) is the table's unique key — a file naming the
        // same ship twice must not bounce the whole insert.
        const dedupe = `${supplierId}::${type}::${entry.name.toLowerCase()}`
        if (seenProperty.has(dedupe)) continue
        seenProperty.add(dedupe)
        propertyRows.push({ tenant_id, supplier_id: supplierId, property_type: type, name: entry.name })
      }
    }

    let propertiesCreated = 0
    if (propertyRows.length > 0) {
      const { error } = await supabase.from('supplier_properties').insert(propertyRows)
      if (error) {
        // The suppliers are already in. Say what did not follow them rather
        // than reporting a success that is only partly true.
        propertyWarnings.push({ row: 0, reason: `Properties could not be saved: ${error.message}` })
      } else {
        propertiesCreated = propertyRows.length
      }
    }

    // Properties named against a supplier that already existed are NOT created:
    // an import creates, it never reaches into a supplier already on file.
    const propertiesSkippedExisting = resolved.records
      .filter(r => r.properties?.length && skippedExisting.includes(r.name))
      .reduce((n, r) => n + (r.properties?.length ?? 0), 0)

    return NextResponse.json({
      success: true,
      totalRows: parsed.totalRows,
      inserted,
      skippedExisting,
      refused,
      typeDefaulted: parsed.typeDefaulted,
      propertiesCreated,
      propertiesSkippedExisting,
      propertyWarnings,
    })
  } catch (error) {
    console.error('suppliers import error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
