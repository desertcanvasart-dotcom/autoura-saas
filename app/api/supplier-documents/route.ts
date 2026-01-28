import { createClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Document number prefixes
const DOC_PREFIXES: Record<string, string> = {
  hotel_voucher: 'HV',
  service_order: 'SO',
  transport_voucher: 'TV',
  activity_voucher: 'AV',
  guide_assignment: 'GA',
  cruise_voucher: 'CV'
}

async function generateDocumentNumber(supabase: any, docType: string): Promise<string> {
  const prefix = DOC_PREFIXES[docType] || 'SD'
  const year = new Date().getFullYear()
  const pattern = `${prefix}-${year}-%`
  
  const { data } = await supabase
    .from('supplier_documents')
    .select('document_number')
    .like('document_number', pattern)
    .order('document_number', { ascending: false })
    .limit(1)
  
  let nextNum = 1
  if (data && data.length > 0) {
    const lastNum = data[0].document_number
    const match = lastNum.match(/-(\d+)$/)
    if (match) {
      nextNum = parseInt(match[1], 10) + 1
    }
  }
  
  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`
}

export async function GET(request: NextRequest) {
  // Authenticate and get tenant context
  const authResult = await requireAuth()
  if (authResult.error) return authResult.response

  const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
  const { searchParams } = new URL(request.url)

  // Filter parameters
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const itineraryId = searchParams.get('itineraryId')
  const supplierId = searchParams.get('supplierId')
  const search = searchParams.get('search')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  let query = supabase
    .from('supplier_documents')
    .select(`
      *,
      itinerary:itineraries(id, itinerary_code, trip_name, client_name),
      supplier:suppliers(id, name, type)
    `)
    .order('created_at', { ascending: false })
  
  // Apply filters
  if (type) {
    query = query.eq('document_type', type)
  }
  
  if (status) {
    query = query.eq('status', status)
  }
  
  if (itineraryId) {
    query = query.eq('itinerary_id', itineraryId)
  }
  
  if (supplierId) {
    query = query.eq('supplier_id', supplierId)
  }
  
  if (search) {
    query = query.or(`document_number.ilike.%${search}%,supplier_name.ilike.%${search}%,client_name.ilike.%${search}%,city.ilike.%${search}%`)
  }
  
  if (startDate) {
    query = query.gte('service_date', startDate)
  }
  
  if (endDate) {
    query = query.lte('service_date', endDate)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching supplier documents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  // Calculate summary stats
  const stats = {
    total: data?.length || 0,
    draft: data?.filter(d => d.status === 'draft').length || 0,
    sent: data?.filter(d => d.status === 'sent').length || 0,
    confirmed: data?.filter(d => d.status === 'confirmed').length || 0,
    completed: data?.filter(d => d.status === 'completed').length || 0,
    by_type: {
      hotel_voucher: data?.filter(d => d.document_type === 'hotel_voucher').length || 0,
      service_order: data?.filter(d => d.document_type === 'service_order').length || 0,
      transport_voucher: data?.filter(d => d.document_type === 'transport_voucher').length || 0,
      activity_voucher: data?.filter(d => d.document_type === 'activity_voucher').length || 0,
      guide_assignment: data?.filter(d => d.document_type === 'guide_assignment').length || 0,
      cruise_voucher: data?.filter(d => d.document_type === 'cruise_voucher').length || 0
    }
  }
  
  return NextResponse.json({
    success: true,
    data,
    stats
  })
}

export async function POST(request: NextRequest) {
  // Authenticate and get tenant context
  const authResult = await requireAuth()
  if (authResult.error) return authResult.response

  const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

  try {
    const body = await request.json()

    // Generate document number if not provided
    if (!body.document_number) {
      body.document_number = await generateDocumentNumber(supabase, body.document_type)
    }

    // Add tenant_id for multi-tenancy
    body.tenant_id = tenant_id

    // If supplier_id provided, fetch supplier details
    if (body.supplier_id && !body.supplier_name) {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('name, contact_name, contact_email, contact_phone, address, city, country')
        .eq('id', body.supplier_id)
        .single()

      if (supplier) {
        body.supplier_name = supplier.name
        body.supplier_contact_name = body.supplier_contact_name || supplier.contact_name
        body.supplier_contact_email = body.supplier_contact_email || supplier.contact_email
        body.supplier_contact_phone = body.supplier_contact_phone || supplier.contact_phone
        body.supplier_address = body.supplier_address || [supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ')
      }
    }

    // If itinerary_id provided, fetch client details
    if (body.itinerary_id && !body.client_name) {
      const { data: itinerary } = await supabase
        .from('itineraries')
        .select('client_name, num_adults, num_children')
        .eq('id', body.itinerary_id)
        .single()

      if (itinerary) {
        body.client_name = itinerary.client_name
        body.num_adults = body.num_adults || itinerary.num_adults
        body.num_children = body.num_children || itinerary.num_children
      }
    }

    const { data, error } = await supabase
      .from('supplier_documents')
      .insert([body])
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier document:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error) {
    console.error('Error in POST supplier-documents:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}