// POST  create the trip's supplier documents it has not got yet
// GET   list them without creating anything (the trip's documents page)
//
// What a trip needs, and how it is grouped: lib/documents/plan-supplier-documents.

import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { insertNumbered } from '@/lib/documents/numberer'
import { NextRequest, NextResponse } from 'next/server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { requestedDocTypes } from '@/lib/documents/group-services'
import { planSupplierDocuments, staleSupplierDocuments, type PlanDay, type PlanGuide } from '@/lib/documents/plan-supplier-documents'

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
    const { data } = await supabase.from('suppliers').select('*').in('id', supplierIds)
    suppliers = Object.fromEntries((data ?? []).map(s => [s.id, s]))
  }

  const { data: existing } = await supabase
    .from('supplier_documents')
    .select('id, document_number, supplier_id, document_type, supplier_name, check_in, check_out, services')
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
  const guideIds = [...new Set((assigned ?? []).map(a => a.resource_id))]
  const { data: guideRows } = guideIds.length
    ? await supabase.from('guides').select('id, name, full_name, languages, email, phone, whatsapp').in('id', guideIds).eq('tenant_id', tenantId)
    : { data: [] }
  const guideById = new Map((guideRows ?? []).map(g => [g.id, g]))
  const guides: PlanGuide[] = (assigned ?? []).flatMap(a => {
    const g = guideById.get(a.resource_id)
    const name = g?.full_name || g?.name || a.resource_name
    return name ? [{
      resource_id: a.resource_id,
      name,
      languages: g?.languages ?? null,
      email: g?.email ?? null,
      phone: g?.phone || g?.whatsapp || null,
      itinerary_day_id: a.itinerary_day_id,
      start_date: a.start_date,
      end_date: a.end_date,
      status: a.status,
    }] : []
  })

  return {
    rows: planSupplierDocuments({ tenantId, itinerary, days, suppliers, existing: existing ?? [], guides, documentTypes }),
    stale: staleSupplierDocuments(days, existing ?? []),
  }
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
    const { rows: missing, stale } = await planForItinerary(supabase, trip.itinerary, trip.days, authResult.tenant_id, null)
    return NextResponse.json({
      success: true,
      // Documents made before the trip changed and holding lines it no longer has.
      stale,
      missing: missing.map(d => ({
        document_type: d.document_type,
        supplier_name: d.supplier_name,
        lines: Array.isArray(d.services) ? d.services.length : 0,
      })),
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

    const { rows: documentsToCreate } = await planForItinerary(supabase, itinerary, days, authResult.tenant_id, document_types)

    // Insert all documents
    if (documentsToCreate.length > 0) {


      // Numbered as one batch, across every tenant's numbers; a number taken
      // by an overlapping request in between is renumbered and retried.
      const { data: createdDocs, error: createError } = await insertNumbered(
        documentsToCreate,
        supabase,
        rows => supabase.from('supplier_documents').insert(rows).select()
      )

      if (createError) {
        console.error('❌ Error creating documents:', createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }



      const created = createdDocs ?? []
      return NextResponse.json({
        success: true,
        message: `Generated ${created.length} document(s)`,
        count: created.length,
        documents: created
      })
    }



    return NextResponse.json({
      success: true,
      message: 'No new documents to generate. Documents may already exist or no services found.',
      count: 0,
      documents: []
    })

  } catch (error) {
    console.error('❌ Error generating documents:', error)
    return NextResponse.json({ error: 'Failed to generate documents' }, { status: 500 })
  }
}