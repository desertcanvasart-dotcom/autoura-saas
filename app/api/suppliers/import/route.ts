import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { parseSuppliersCsv, planSupplierImport, resolveImportTypes, type SupplierImportRecord } from '@/lib/suppliers/import-csv'
import { nextSupplierCodes } from '@/lib/suppliers/supplier-code'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { planNamedProperties, type NamedPropertyEntry, type SupplierRef, type ExistingProperty } from '@/lib/suppliers/property-csv-plan'
import type { Database } from '@/types/database.types'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']

// ============================================
// POST /api/suppliers/import — suppliers CSV import (B-item 7)
// ============================================
// Parsing/classification live in lib/suppliers/import-csv.ts (tested
// there). This route authenticates, reads the tenant's suppliers, updates the
// ones the file matches (by code, else name) and creates the rest — each new
// one with the next free SUP-#### when the sheet gives it no code.

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    // Where the agency runs its trips (Settings → Organization), or none. Every
    // supplier was stored as Egypt — the form has no country field — and every
    // supplier document printed "…, Cairo, Egypt" whoever the agency was.
    const { data: tenantRow } = await supabase.from('tenants').select('operating_country').eq('id', tenant_id).maybeSingle()
    const operatingCountry = (tenantRow as { operating_country?: string | null } | null)?.operating_country?.trim() || null

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
    // Existing suppliers (this tenant): matched by code, else name, and
    // updated — their ids and ROLES are read too, since a property may be
    // topped up onto one and is validated against what that supplier is.
    // Paged: a plain select stops at 1000 rows (documents audit, round 12).
    const { data: existing } = await fetchAllPages((from, to) => supabase
      .from('suppliers')
      .select('id, name, supplier_code, type, types')
      .eq('tenant_id', tenant_id)
      .order('id', { ascending: true })
      .range(from, to))
    const plan = planSupplierImport(resolved.records, (existing ?? []).map(s => ({
      id: String(s.id), name: s.name ?? null, supplier_code: s.supplier_code ?? null,
    })))
    const refused = [...parsed.refused, ...resolved.refused, ...plan.refused].sort((a, b) => a.row - b.row)

    // The supplier columns a row fills in. On an update only these are written
    // (a blank cell leaves the stored value alone); the roles only when the
    // row named some.
    const fields = (r: SupplierImportRecord) => {
      const out: Record<string, unknown> = {}
      for (const k of ['contact_name', 'contact_email', 'contact_phone', 'phone2', 'whatsapp', 'address', 'city',
        'country', 'commission_type', 'default_commission_rate', 'status', 'notes', 'website'] as const) {
        if (r[k] !== undefined) out[k] = r[k]
      }
      if (r.typeGiven !== false) { out.type = r.type; out.types = r.types }
      return out
    }

    // Updates: one row each, so one bad row is one refusal, not a failed file.
    let updated = 0
    // The roles a supplier has AFTER this import: a property is checked against
    // them (a sheet that makes a supplier a hotel may hang a hotel off it).
    const rolesAfter = new Map<string, string[]>()
    for (const u of plan.updates) {
      const patch: Record<string, unknown> = { ...fields(u.record), name: u.record.name, company_name: u.record.name, updated_at: new Date().toISOString() }
      // A supplier matched by name that had no code takes the sheet's.
      if (u.matchedBy === 'name' && u.record.supplier_code) patch.supplier_code = u.record.supplier_code
      const { error } = await supabase.from('suppliers').update(patch as never).eq('id', u.id).eq('tenant_id', tenant_id)
      if (error) refused.push({ row: u.record.row, reason: `"${u.record.name}": ${error.message}` })
      else {
        updated++
        if (u.record.typeGiven !== false) rolesAfter.set(u.id, u.record.types)
      }
    }

    // Creates: every new supplier gets a code — its own, or the next free
    // SUP-#### — so a rate sheet can always name it.
    const fresh = nextSupplierCodes(
      [...(existing ?? []).map(s => s.supplier_code), ...plan.creates.map(r => r.supplier_code)],
      plan.creates.filter(r => !r.supplier_code).length,
    )
    let codeIndex = 0
    const rows: Array<{ record: SupplierImportRecord; insert: SupplierInsert }> = plan.creates.map(r => ({
      record: r,
      insert: {
        tenant_id,
        name: r.name,
        // company_name is NOT NULL and mirrors the legacy name column.
        company_name: r.name,
        supplier_code: r.supplier_code || fresh[codeIndex++],
        ...fields(r),
        type: r.type,
        types: r.types,
        country: r.country || operatingCountry,
        status: r.status || 'active',
      } as SupplierInsert,
    }))

    let inserted = 0
    let createdSuppliers: Array<{ id: string; name: string; types: string[] }> = []
    const keep = (data: Array<{ id: unknown; name: unknown; type: unknown; types: unknown }> | null) => {
      for (const d of data ?? []) {
        createdSuppliers.push({
          id: String(d.id),
          name: String(d.name),
          types: (Array.isArray(d.types) && d.types.length ? d.types : [d.type]).filter(Boolean).map(String),
        })
      }
    }
    if (rows.length > 0) {
      const { data, error } = await supabase.from('suppliers').insert(rows.map(r => r.insert)).select('id, name, type, types')
      if (!error) {
        keep(data)
        inserted = rows.length
      } else {
        // One bad row failed the batch: try them one by one, so the rest land
        // and the bad one is named.
        createdSuppliers = []
        for (const r of rows) {
          const one = await supabase.from('suppliers').insert(r.insert).select('id, name, type, types')
          if (one.error) refused.push({ row: r.record.row, reason: `"${r.record.name}": ${one.error.message}` })
          else { keep(one.data); inserted++ }
        }
      }
    }
    refused.sort((a, b) => a.row - b.row)

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
      ...(existing ?? []).map(s => asRef(rolesAfter.has(String(s.id)) ? { ...s, types: rolesAfter.get(String(s.id)) } : s)),
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
    // Read for the whole tenant, paged — an .in() of every supplier id could
    // outgrow the URL and come back empty, and the top-up then tried to create
    // properties that were already there.
    let existingProperties: ExistingProperty[] = []
    if (entries.length > 0 && knownSuppliers.length > 0) {
      const { data } = await fetchAllPages((from, to) => supabase
        .from('supplier_properties')
        .select('id, supplier_id, property_type, name')
        .eq('tenant_id', tenant_id)
        .order('id', { ascending: true })
        .range(from, to))
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
      updated,
      exampleRows: parsed.exampleRows ?? 0,
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
