// POST  sync the trip's supplier documents: create what is missing, bring the
//       drafts Generate made (untouched since) in step, retire the ones the
//       trip no longer needs (kept as Cancelled)
// GET   say what POST would do, without changing anything, plus what the
//       documents cannot show: documents a person edited or sent that no
//       longer match, nights and days that look unplanned, and the lines
//       that go on no document and why (the trip's documents page)
//
// What a trip needs, and how it is grouped: lib/documents/plan-supplier-documents.

import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { insertNumbered } from '@/lib/documents/numberer'
import { NextRequest, NextResponse } from 'next/server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { requestedDocTypes } from '@/lib/documents/group-services'
import { parseManualAssignee } from '@/lib/notify/assignment-message'
import { syncSupplierDocuments, coverageWarnings, excludedLines, type PlanDay, type PlanGuide } from '@/lib/documents/plan-supplier-documents'
import { gateRole } from '@/lib/api-role-gate'

type Admin = ReturnType<typeof createAdminClient>

/** The trip's documents still to make, and the ones it has that no longer
 *  match it: suppliers, assigned guides and existing documents read here,
 *  the grouping in lib/documents/plan-supplier-documents. */
async function planForItinerary(
  supabase: Admin,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the row as selected
  itinerary: any,
  days: PlanDay[],
  tenantId: string,
  documentTypes: string[] | null,
) {
  const supplierIds = [...new Set(days.flatMap(d => (d.services ?? []).map(s => s.supplier_id).filter(Boolean)))] as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supplier rows
  let suppliers: Record<string, any> = {}
  if (supplierIds.length > 0) {
    // Admin client: only this tenant's suppliers — a service's supplier_id is
    // whatever was saved on it, and another tenant's would bring their contact.
    const { data } = await supabase.from('suppliers').select('*').in('id', supplierIds).eq('tenant_id', tenantId)
    suppliers = Object.fromEntries((data ?? []).map(s => [s.id, s]))
  }

  const { data: existing } = await supabase
    .from('supplier_documents')
    .select('id, document_number, supplier_id, document_type, supplier_name, check_in, check_out, service_date, services, status, sync_key, synced_hash')
    .eq('itinerary_id', itinerary.id)
    .neq('status', 'cancelled')

  // The guides assigned to the trip, each on their own assignment.
  const { data: assigned } = await supabase
    .from('itinerary_resources')
    .select('resource_id, resource_name, itinerary_day_id, start_date, end_date, status')
    .eq('itinerary_id', itinerary.id)
    .eq('tenant_id', tenantId)
    .eq('resource_type', 'guide')
    .neq('status', 'cancelled')
  // Guides are SUPPLIERS (supplier_type 'guide') — what /api/guides lists and
  // what assignment resource_ids point at; the standalone guides table is
  // legacy (lib/staff-link). Read from guides alone, every assigned guide's
  // assignment went out with no email, phone or languages, and sending it
  // failed ("Supplier email is required").
  const guideIds = [...new Set((assigned ?? []).map(a => a.resource_id).filter(Boolean))]
  const [{ data: supplierGuides }, { data: legacyGuides }] = guideIds.length
    ? await Promise.all([
        supabase.from('suppliers').select('id, name, company_name, languages, email, contact_email, phone, contact_phone, whatsapp').in('id', guideIds).eq('tenant_id', tenantId),
        supabase.from('guides').select('id, name, full_name, languages, email, phone, whatsapp').in('id', guideIds).eq('tenant_id', tenantId),
      ])
    : [{ data: [] }, { data: [] }]
  type GuideContact = { name: string | null; languages: string[] | null; email: string | null; phone: string | null }
  const guideById = new Map<string, GuideContact>()
  for (const g of legacyGuides ?? []) {
    guideById.set(g.id, { name: g.full_name || g.name, languages: g.languages, email: g.email, phone: g.whatsapp || g.phone })
  }
  for (const s of supplierGuides ?? []) {
    guideById.set(s.id, {
      name: s.name || s.company_name,
      languages: s.languages,
      email: s.email || s.contact_email,
      phone: s.whatsapp || s.phone || s.contact_phone,
    })
  }
  const guides: PlanGuide[] = (assigned ?? []).flatMap(a => {
    const g = guideById.get(a.resource_id)
    // A guide typed in by hand for this trip ("Name · +20 …"): its own phone.
    const manual = g ? null : parseManualAssignee(a.resource_name)
    const name = g?.name || manual?.name || a.resource_name
    return name ? [{
      resource_id: a.resource_id,
      name,
      languages: g?.languages ?? null,
      email: g?.email ?? null,
      phone: g?.phone ?? manual?.phone ?? null,
      itinerary_day_id: a.itinerary_day_id,
      start_date: a.start_date,
      end_date: a.end_date,
      status: a.status,
    }] : []
  })

  return syncSupplierDocuments({ tenantId, itinerary, days, suppliers, existing: existing ?? [], guides, documentTypes })
}

/** The trip and its days with their services, for the caller's tenant. */
async function loadTrip(supabase: Admin, itineraryId: string, tenantId: string) {
  const { data: itinerary, error: itinError } = await supabase
    .from('itineraries')
    .select('*')
    .eq('id', itineraryId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (itinError) return { error: NextResponse.json({ error: 'Itinerary not found', details: itinError.message }, { status: 404 }) }
  if (!itinerary) return { error: NextResponse.json({ error: 'Itinerary not found' }, { status: 404 }) }

  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select(`
      *,
      services:itinerary_services!itinerary_services_day_id_fkey(*)
    `)
    .eq('itinerary_id', itineraryId)
    .order('day_number', { ascending: true })
  if (daysError) return { error: NextResponse.json({ error: daysError.message }, { status: 500 }) }

  return { itinerary, days: (days ?? []) as PlanDay[] }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
  }
  const supabase = createAdminClient()
  const { id: itineraryId } = await params
  try {
    const trip = await loadTrip(supabase, itineraryId, authResult.tenant_id)
    if (trip.error) return trip.error
    const plan = await planForItinerary(supabase, trip.itinerary, trip.days, authResult.tenant_id, null)
    return NextResponse.json({
      success: true,
      missing: plan.create.map(d => ({
        document_type: d.document_type,
        supplier_name: d.supplier_name,
        lines: Array.isArray(d.services) ? d.services.length : 0,
      })),
      // Generate's own drafts that Sync would bring in step, or retire.
      outdated: plan.update.map(({ id, document_number, supplier_name }) => ({ id, document_number, supplier_name })),
      retire: plan.retire,
      // Documents a person edited or sent that hold lines the trip no longer has.
      stale: plan.stale,
      coverage: coverageWarnings(trip.days),
      excluded: excludedLines(trip.days),
    })
  } catch (error) {
    console.error('❌ Error listing missing documents:', error)
    return NextResponse.json({ success: false, error: 'Failed to check documents' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }

  const supabase = createAdminClient()
  const { id: itineraryId } = await params

  try {
    const roleGate = await gateRole('staff')
    if (roleGate) return roleGate
    const body = await request.json().catch(() => ({}))
    const document_types = requestedDocTypes(body)




    const trip = await loadTrip(supabase, itineraryId, authResult.tenant_id)
    if (trip.error) return trip.error
    const { itinerary, days } = trip

    // Output gate (harness Layer 2): don't generate operational paperwork for an
    // itinerary whose price isn't deliverable.
    const priceCheck = checkAmountDeliverable(itinerary.total_cost, { currency: itinerary.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    const plan = await planForItinerary(supabase, itinerary, days, authResult.tenant_id, document_types)

    let created: unknown[] = []
    if (plan.create.length > 0) {
      // Numbered as one batch, across every tenant's numbers; a number taken
      // by an overlapping request in between is renumbered and retried.
      const { data: createdDocs, error: createError } = await insertNumbered(
        plan.create,
        supabase,
        rows => supabase.from('supplier_documents').insert(rows).select()
      )
      if (createError) {
        console.error('❌ Error creating documents:', createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
      created = createdDocs ?? []
    }

    // Each change is held to a draft: a document sent between the plan and
    // now is left be.
    let updated = 0
    for (const u of plan.update) {
      const { data, error } = await supabase
        .from('supplier_documents')
        .update({ ...u.fields, updated_at: new Date().toISOString() })
        .eq('id', u.id)
        .eq('tenant_id', authResult.tenant_id)
        .eq('status', 'draft')
        .select('id')
      if (error) {
        console.error('❌ Error updating document:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      updated += data?.length ?? 0
    }

    let retired = 0
    if (plan.retire.length > 0) {
      const { data, error } = await supabase
        .from('supplier_documents')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', plan.retire.map(r => r.id))
        .eq('tenant_id', authResult.tenant_id)
        .eq('status', 'draft')
        .select('id')
      if (error) {
        console.error('❌ Error retiring documents:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      retired = data?.length ?? 0
    }

    const parts = [
      created.length ? `created ${created.length}` : '',
      updated ? `updated ${updated}` : '',
      retired ? `cancelled ${retired} no longer needed` : '',
    ].filter(Boolean)
    return NextResponse.json({
      success: true,
      message: parts.length
        ? `Documents synced: ${parts.join(', ')}.`
        : 'The documents already match the trip. Nothing to change.',
      count: created.length,
      updated,
      retired,
      documents: created,
      // Edited or sent documents that no longer match: a person decides.
      stale: plan.stale,
    })

  } catch (error) {
    console.error('❌ Error generating documents:', error)
    return NextResponse.json({ error: 'Failed to generate documents' }, { status: 500 })
  }
}