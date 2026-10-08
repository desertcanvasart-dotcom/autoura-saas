// Supplier documents for an itinerary.
//
//   POST — Sync: the documents become the itinerary's. Creates what is
//          missing, updates the drafts Sync made, retires what the trip no
//          longer needs (kept as Cancelled), and never overwrites a document a
//          person edited or sent — those come back as `attention`, and only
//          `replace: [ids]` (the person's own "Replace with the itinerary's
//          version") rewrites them. `documentTypes` limits it to some kinds.
//   GET  — Coverage: every service line, the document it is on, what is
//          excluded on purpose, what needs a person, and nights or days that
//          look unplanned. The documents page shows it; nothing to run by hand.
//
// The rules are lib/documents/sync-plan (pure, shared with the tests).

import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { requestedDocTypes } from '@/lib/documents/group-services'
import {
  planDocuments, reconcileDocuments, coverageWarnings, linesHash,
  type PlanDay, type PlanSupplier, type PlannedDoc, type ExistingDoc,
} from '@/lib/documents/sync-plan'

const DOC_PREFIXES: Record<string, string> = {
  hotel_voucher: 'HV',
  service_order: 'SO',
  transport_voucher: 'TV',
  guide_assignment: 'GA',
  cruise_voucher: 'CV',
}

type Admin = ReturnType<typeof createAdminClient>
type Ctx = { params: Promise<{ id: string }> }

/** The next free number per prefix, for a batch of new documents. */
async function numberer(db: Admin) {
  const next: Record<string, number> = {}
  const year = new Date().getFullYear()
  return async (docType: string) => {
    const prefix = DOC_PREFIXES[docType] || 'SD'
    if (next[prefix] === undefined) {
      const { data } = await db.from('supplier_documents').select('document_number')
        .like('document_number', `${prefix}-${year}-%`).order('document_number', { ascending: false }).limit(1)
      const m = data?.[0]?.document_number?.match(/-(\d+)$/)
      next[prefix] = m ? parseInt(m[1], 10) + 1 : 1
    }
    return `${prefix}-${year}-${String(next[prefix]++).padStart(4, '0')}`
  }
}

/** The trip, its days with their services, the suppliers on them, and its documents. */
async function load(db: Admin, itineraryId: string, tenantId: string) {
  const { data: itinerary } = await db.from('itineraries').select('*').eq('id', itineraryId).eq('tenant_id', tenantId).maybeSingle()
  if (!itinerary) return null

  const { data: dayRows, error: daysError } = await db.from('itinerary_days')
    .select('id, day_number, date, city, overnight_city, attractions')
    .eq('itinerary_id', itineraryId).order('day_number', { ascending: true })
  if (daysError) throw daysError
  const dayIds = (dayRows ?? []).map(d => d.id)

  // A service names its day in day_id or itinerary_day_id (writers differ;
  // migration 385 keeps them in step) — read by both, so none is missed.
  const services = new Map<string, Record<string, unknown>>()
  if (dayIds.length > 0) {
    for (const col of ['day_id', 'itinerary_day_id'] as const) {
      const { data, error } = await db.from('itinerary_services').select('*').in(col, dayIds)
      if (error) throw error
      for (const s of data ?? []) services.set(s.id, s)
    }
  }
  const days: (PlanDay & { id: string })[] = (dayRows ?? []).map(d => ({
    ...d,
    services: [...services.values()]
      .filter(s => (s.day_id ?? s.itinerary_day_id) === d.id)
      .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))) as never,
  }))

  const supplierIds = [...new Set([...services.values()].map(s => s.supplier_id).filter(Boolean) as string[])]
  const suppliers: Record<string, PlanSupplier> = {}
  if (supplierIds.length > 0) {
    const { data } = await db.from('suppliers').select('id, name, contact_name, contact_email, contact_phone, address, city, country, payment_terms')
      .in('id', supplierIds).eq('tenant_id', tenantId)
    for (const s of data ?? []) suppliers[s.id] = s
  }

  const { data: docs, error: docsError } = await db.from('supplier_documents')
    .select('id, document_type, document_number, supplier_id, supplier_name, status, services, sync_key, synced_hash, created_at')
    .eq('itinerary_id', itineraryId).eq('tenant_id', tenantId)
  if (docsError) throw docsError

  return { itinerary, days, suppliers, docs: (docs ?? []) as (ExistingDoc & { created_at: string | null })[] }
}

/** The columns a planned document writes. */
function fields(p: PlannedDoc, itinerary: Record<string, any>, supplier: PlanSupplier | undefined) {
  const night = p.docType === 'hotel_voucher' || p.docType === 'cruise_voucher'
  return {
    document_type: p.docType,
    supplier_id: p.supplierId,
    supplier_name: p.title,
    supplier_contact_name: supplier?.contact_name ?? null,
    supplier_contact_email: supplier?.contact_email ?? null,
    supplier_contact_phone: supplier?.contact_phone ?? null,
    supplier_address: supplier ? [supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ') : p.cities.join(', '),
    client_name: itinerary.client_name,
    client_nationality: itinerary.nationality,
    num_adults: itinerary.num_adults || 1,
    num_children: itinerary.num_children || 0,
    services: p.lines as never, // DocLine[] is JSON
    city: p.cities.join(', '),
    service_date: night ? null : p.firstDate ?? itinerary.start_date,
    check_in: night ? p.firstDate : null,
    check_out: night ? p.checkOut : null,
    currency: itinerary.currency || 'EUR',
    total_cost: p.totalCost,
    payment_terms: supplier ? supplier.payment_terms || 'commission' : 'pay_direct',
    sync_key: p.key,
    synced_hash: linesHash(p.lines),
    updated_at: new Date().toISOString(),
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { id } = await params
  try {
    const db = createAdminClient()
    const trip = await load(db, id, auth.tenant_id)
    if (!trip) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    const plan = planDocuments(trip.days, trip.suppliers)
    const r = reconcileDocuments(plan.docs, trip.docs)
    const docNumber = new Map(trip.docs.map(d => [d.id, d.document_number]))
    const onDocuments = plan.docs.reduce((n, d) => n + d.lines.length, 0)
    return NextResponse.json({
      success: true,
      coverage: {
        totalLines: plan.totalLines,
        onDocuments,
        excluded: plan.excluded.map(e => ({ day: e.line.day_number, name: e.line.service_name, reason: e.reason })),
        documents: plan.docs.map(p => ({ key: p.key, title: p.title, docType: p.docType, lines: p.lines.length, cities: p.cities })),
        // What Sync would do now: nothing pending means the documents ARE the itinerary.
        pending: {
          create: r.create.map(p => ({ title: p.title, docType: p.docType, lines: p.lines.length })),
          update: r.update.map(u => ({ docId: u.docId, documentNumber: docNumber.get(u.docId) ?? null, title: u.planned.title })),
          retire: r.retire.map(x => ({ docId: x.docId, documentNumber: docNumber.get(x.docId) ?? null, why: x.why })),
        },
        attention: r.attention,
        warnings: coverageWarnings(trip.days),
      },
    })
  } catch (error) {
    console.error('[documents] coverage failed:', error)
    return NextResponse.json({ success: false, error: 'Could not check the documents' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { id: itineraryId } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const onlyTypes = requestedDocTypes(body)
    const replace = Array.isArray(body?.replace) ? body.replace.map(String) : []
    const db = createAdminClient()
    const trip = await load(db, itineraryId, auth.tenant_id)
    if (!trip) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

    // Output gate (harness Layer 2): no operational paperwork for an itinerary
    // whose price isn't deliverable.
    const priceCheck = checkAmountDeliverable(trip.itinerary.total_cost, { currency: trip.itinerary.currency })
    if (!priceCheck.ok) {
      return NextResponse.json({ success: false, error: 'Itinerary price is not deliverable', violations: priceCheck.violations }, { status: 422 })
    }

    const plan = planDocuments(trip.days, trip.suppliers)
    const r = reconcileDocuments(plan.docs, trip.docs, { onlyTypes, force: replace })
    const nextNumber = await numberer(db)
    const now = new Date().toISOString()

    const created: unknown[] = []
    if (r.create.length > 0) {
      const rows = []
      for (const p of r.create) {
        rows.push({
          ...fields(p, trip.itinerary, p.supplierId ? trip.suppliers[p.supplierId] : undefined),
          tenant_id: auth.tenant_id,
          itinerary_id: itineraryId,
          document_number: await nextNumber(p.docType),
          status: 'draft',
        })
      }
      const { data, error } = await db.from('supplier_documents').insert(rows).select()
      if (error) throw error
      created.push(...(data ?? []))
    }

    for (const u of r.update) {
      // A replaced sent document goes back to draft: it has to be sent again.
      const { error } = await db.from('supplier_documents')
        .update({ ...fields(u.planned, trip.itinerary, u.planned.supplierId ? trip.suppliers[u.planned.supplierId] : undefined), status: 'draft', sent_at: null, confirmed_at: null })
        .eq('id', u.docId).eq('tenant_id', auth.tenant_id)
      if (error) throw error
    }

    if (r.retire.length > 0) {
      const { error } = await db.from('supplier_documents')
        .update({ status: 'cancelled', updated_at: now })
        .in('id', r.retire.map(x => x.docId)).eq('tenant_id', auth.tenant_id).eq('status', 'draft')
      if (error) throw error
    }

    const parts = [
      r.create.length && `${r.create.length} created`,
      r.update.length && `${r.update.length} updated`,
      r.retire.length && `${r.retire.length} older draft(s) replaced (kept as Cancelled)`,
    ].filter(Boolean)
    const message = parts.length > 0 ? `Documents synced: ${parts.join(', ')}.` : 'Documents already match the itinerary.'
    return NextResponse.json({
      success: true,
      message: r.attention.length > 0 ? `${message} ${r.attention.length} need a look.` : message,
      count: created.length,
      documents: created,
      created: r.create.length,
      updated: r.update.length,
      retired: r.retire.length,
      attention: r.attention,
    })
  } catch (error) {
    console.error('[documents] sync failed:', error)
    return NextResponse.json({ success: false, error: 'Failed to sync documents' }, { status: 500 })
  }
}
