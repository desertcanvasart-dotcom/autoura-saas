import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
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
      .select('*, client:clients(id, first_name, last_name, email)')
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

    const { data: services, error: servicesError } = await supabase
      .from('itinerary_day_services')
      .select(`
        *,
        supplier:suppliers(*)
      `)
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
    const commissionsToCreate = eligibleServices
      .filter(s => s.supplier && (s.commission_rate || s.supplier.default_commission_rate))
      .map(s => {
        const rate = s.commission_rate || s.supplier.default_commission_rate || 0
        const baseAmount = Number(s.selling_price || s.cost || 0)
        const commissionAmount = (baseAmount * rate) / 100

        return {
          itinerary_id: itineraryId,
          supplier_id: s.supplier_id,
          client_id: itinerary.client?.id || null,
          commission_type: s.supplier.commission_type || 'receivable',
          category: typeToCategory[s.service_type] || 'other',
          source_name: s.supplier.name,
          description: `${s.description || s.service_type} - ${itinerary.itinerary_code}`,
          base_amount: baseAmount,
          commission_rate: rate,
          commission_amount: commissionAmount,
          currency: 'EUR',
          status: 'pending',
          transaction_date: itinerary.start_date || new Date().toISOString().split('T')[0],
          notes: `Auto-generated from itinerary ${itinerary.itinerary_code}`
        }
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
      .filter(s => s.supplier && (s.commission_rate || s.supplier.default_commission_rate))
      .map(s => s.id)

    if (serviceIds.length > 0) {
      await supabase
        .from('itinerary_day_services')
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