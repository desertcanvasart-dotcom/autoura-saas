import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import type { Tables } from '@/types/database.types'

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
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const { id: itineraryId } = await params

    // Get itinerary details - RLS ensures tenant isolation
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    // Get all days for this itinerary
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('id')
      .eq('itinerary_id', itineraryId)

    if (daysError || !days || days.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No days found for this itinerary',
        generated: 0 
      })
    }

    const dayIds = days.map(d => d.id)

    // Get all services with a supplier assigned. There is no FK between
    // itinerary_services and suppliers, so the supplier rows are fetched
    // separately (a PostgREST embed would fail without the relation).
    const { data: services, error: servicesError } = await supabase
      .from('itinerary_services')
      .select('*')
      .in('day_id', dayIds)
      .not('supplier_id', 'is', null)

    if (servicesError) {
      console.error('Error fetching services:', servicesError)
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
    }

    const supplierIds = [...new Set(
      (services || [])
        .map(s => s.supplier_id)
        .filter((supplierId): supplierId is string => supplierId !== null)
    )]

    const suppliersById = new Map<string, Tables<'suppliers'>>()
    if (supplierIds.length > 0) {
      const { data: suppliers, error: suppliersError } = await supabase
        .from('suppliers')
        .select('*')
        .in('id', supplierIds)

      if (suppliersError) {
        console.error('Error fetching suppliers:', suppliersError)
        return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
      }
      for (const supplier of suppliers || []) {
        suppliersById.set(supplier.id, supplier)
      }
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

    // Map service types to commission categories
    const typeToCategory: Record<string, string> = {
      hotel: 'hotel',
      transport: 'transport',
      restaurant: 'restaurant',
      cruise: 'cruise',
      entrance: 'attraction',
      activity: 'activity',
      shopping: 'shopping',
      guide: 'other',
      driver: 'transport',
      other: 'other'
    }

    // Generate commission records
    const commissionsToCreate = eligibleServices.flatMap(s => {
      const supplier = s.supplier_id ? suppliersById.get(s.supplier_id) : undefined
      if (!supplier || !(s.commission_rate || supplier.default_commission_rate)) return []

      const rate = s.commission_rate || supplier.default_commission_rate || 0
      const baseAmount = Number(s.selling_price || s.cost || 0)
      const commissionAmount = (baseAmount * rate) / 100

      return [{
        tenant_id,
        itinerary_id: itineraryId,
        supplier_id: s.supplier_id,
        client_id: itinerary.client_id || null,
        commission_type: supplier.commission_type || 'receivable',
        category: (s.service_type && typeToCategory[s.service_type]) || 'other',
        source_name: supplier.name,
        description: `${s.description || s.service_type} - ${itinerary.itinerary_code}`,
        base_amount: baseAmount,
        commission_rate: rate,
        commission_amount: commissionAmount,
        currency: s.currency || 'EUR',
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
        const supplier = s.supplier_id ? suppliersById.get(s.supplier_id) : undefined
        return !!supplier && !!(s.commission_rate || supplier.default_commission_rate)
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