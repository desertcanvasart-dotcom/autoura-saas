import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import type { TablesInsert } from '@/types/database.types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    const { id: itineraryId } = await params

    // Get itinerary details - RLS ensures tenant isolation.
    // No FK links itineraries.client_id to clients, so a `client:clients(...)`
    // embed is rejected by PostgREST — the row's own client_id is all we need.
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    // Get all services with suppliers for this itinerary
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('id')
      .eq('itinerary_id', itineraryId)

    if (daysError || !days) {
      return NextResponse.json({ error: 'Failed to fetch itinerary days' }, { status: 500 })
    }

    const dayIds = days.map(d => d.id)

    // `itinerary_day_services` does not exist — the table is `itinerary_services`,
    // and it carries every column this route reads: day_id, supplier_id,
    // commission_status, commission_rate, commission_percent, commission_amount.
    // The wrong name made this route return 500 on every call, so commission
    // generation has never worked. Likewise there is no FK from
    // itinerary_services.supplier_id to suppliers, so a `supplier:suppliers(*)`
    // embed is rejected by PostgREST — suppliers are fetched separately below.
    const { data: services, error: servicesError } = await supabase
      .from('itinerary_services')
      .select('*')
      .in('day_id', dayIds)
      .not('supplier_id', 'is', null)

    if (servicesError) {
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
    }

    // Filter services that haven't had commissions generated
    const eligibleServices = (services || []).filter(
      s => s.commission_status === 'pending' || !s.commission_status
    )

    if (eligibleServices.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No new commissions to generate',
        generated: 0 
      })
    }

    const supplierIds = [...new Set(
      eligibleServices
        .map(s => s.supplier_id)
        .filter((id): id is string => id !== null)
    )]

    const { data: suppliers, error: suppliersError } = await supabase
      .from('suppliers')
      .select('id, name, default_commission_rate, commission_type')
      .in('id', supplierIds)

    if (suppliersError) {
      return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
    }

    const supplierById = new Map((suppliers || []).map(sup => [sup.id, sup]))

    // Map service types to commission categories
    const typeToCategory: Record<string, string> = {
      hotel: 'hotel',
      transport: 'transport',
      restaurant: 'restaurant',
      cruise: 'cruise',
      entrance: 'attraction',
      activity: 'activity',
      shopping: 'shopping',
      other: 'other'
    }

    // Generate commission records
    const commissionsToCreate = eligibleServices.flatMap((s): TablesInsert<'commissions'>[] => {
      const supplier = s.supplier_id ? supplierById.get(s.supplier_id) : undefined
      if (!supplier || !(s.commission_rate || supplier.default_commission_rate)) return []

      const rate = s.commission_rate || supplier.default_commission_rate || 0
      const baseAmount = Number(s.selling_price || s.cost || 0)
      const commissionAmount = (baseAmount * rate) / 100

      return [{
        tenant_id,
        itinerary_id: itineraryId,
        supplier_id: s.supplier_id,
        client_id: itinerary.client_id,
        commission_type: supplier.commission_type || 'receivable',
        category: (s.service_type && typeToCategory[s.service_type]) || 'other',
        source_name: supplier.name,
        description: `${s.description || s.service_type} - ${itinerary.itinerary_code}`,
        base_amount: baseAmount,
        commission_rate: rate,
        commission_amount: commissionAmount,
        currency: 'EUR',
        status: 'pending',
        transaction_date: itinerary.start_date || new Date().toISOString().split('T')[0],
        notes: `Auto-generated from itinerary ${itinerary.itinerary_code}`
      }]
    })

    if (commissionsToCreate.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No services with commission rates found',
        generated: 0 
      })
    }

    // Insert commissions
    const { data: createdCommissions, error: createError } = await supabase
      .from('commissions')
      .insert(commissionsToCreate)
      .select()

    if (createError) {
      console.error('Error creating commissions:', createError)
      return NextResponse.json({ error: 'Failed to create commissions' }, { status: 500 })
    }

    // Update services to mark commissions as generated
    const serviceIds = eligibleServices
      .filter(s => {
        const supplier = s.supplier_id ? supplierById.get(s.supplier_id) : undefined
        return supplier && (s.commission_rate || supplier.default_commission_rate)
      })
      .map(s => s.id)

    if (serviceIds.length > 0) {
      await supabase
        .from('itinerary_services')
        .update({ commission_status: 'generated' })
        .in('id', serviceIds)
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${createdCommissions?.length || 0} commission records`,
      generated: createdCommissions?.length || 0,
      commissions: createdCommissions
    })

  } catch (error) {
    console.error('Error generating commissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}