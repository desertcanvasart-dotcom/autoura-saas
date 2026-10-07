import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { docMappingFor, serviceCity, PlaceNames, entranceLineName, unassignedDocKey, requestedDocTypes } from '@/lib/documents/group-services'

// Map supplier types to document types
const SUPPLIER_TO_DOC_TYPE: Record<string, string> = {
  hotel: 'hotel_voucher',
  transport: 'transport_voucher',
  driver: 'transport_voucher',
  guide: 'guide_assignment',
  cruise: 'cruise_voucher',
  restaurant: 'service_order',
  activity_provider: 'service_order',
  attraction: 'service_order',
  tour_operator: 'service_order',
  ground_handler: 'service_order',
  dmc: 'service_order'
}

// Document number prefixes
const DOC_PREFIXES: Record<string, string> = {
  hotel_voucher: 'HV',
  service_order: 'SO',
  transport_voucher: 'TV',
  guide_assignment: 'GA',
  cruise_voucher: 'CV'
}

// Default supplier names by document type and category
const DEFAULT_SUPPLIER_NAMES: Record<string, Record<string, string>> = {
  hotel_voucher: { default: 'Hotel' },
  transport_voucher: { default: 'Transportation' },
  guide_assignment: { default: 'Guide Services' },
  cruise_voucher: { default: 'Cruise Line' },
  service_order: { 
    meals: 'Restaurant & Meals',
    entrance: 'Entrance Fees',
    default: 'Ground Services'
  }
}

// Track offsets per document type during batch generation
const typeOffsets: Record<string, number> = {}

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

  // Add offset for batch generation (multiple docs of same type)
  const offset = typeOffsets[docType] || 0
  nextNum += offset

  // Increment offset for next call of same type
  typeOffsets[docType] = offset + 1

  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`
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

  // Reset offsets for each request
  Object.keys(typeOffsets).forEach(key => delete typeOffsets[key])

  try {
    const body = await request.json().catch(() => ({}))
    const document_types = requestedDocTypes(body)




    // Fetch itinerary with client details
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .eq('tenant_id', authResult.tenant_id)
      .single()

    if (itinError) {
      console.error('❌ Itinerary fetch error:', itinError)
      return NextResponse.json({ error: 'Itinerary not found', details: itinError.message }, { status: 404 })
    }

    if (!itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    // Output gate (harness Layer 2): don't generate operational paperwork for an
    // itinerary whose price isn't deliverable.
    const priceCheck = checkAmountDeliverable(itinerary.total_cost, { currency: itinerary.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    // Fetch all days with services
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select(`
        *,
        services:itinerary_services!itinerary_services_day_id_fkey(*)
      `)
      .eq('itinerary_id', itineraryId)
      .order('day_number', { ascending: true })

    if (daysError) {
      console.error('❌ Days fetch error:', daysError)
      return NextResponse.json({ error: daysError.message }, { status: 500 })
    }



    // Collect all supplier IDs from services
    const supplierIds = new Set<string>()
    let totalServices = 0
    for (const day of days || []) {
      for (const service of day.services || []) {
        totalServices++
        if (service.supplier_id) {
          supplierIds.add(service.supplier_id)
        }
      }
    }



    // Fetch all suppliers at once
    let suppliersMap: Record<string, any> = {}
    if (supplierIds.size > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('*')
        .in('id', Array.from(supplierIds))

      if (suppliers) {
        suppliersMap = Object.fromEntries(suppliers.map(s => [s.id, s]))
      }
    }

    // Group services by supplier (when supplier is assigned)
    const supplierGroups: Record<string, {
      supplier: any,
      services: any[],
      cities: Set<string>,
      dates: { min: string, max: string },
      docType: string,
      category?: string
    }> = {}

    // Group services WITHOUT suppliers by what they are and where the party
    // is (lib/documents/group-services): one transport voucher, one hotel
    // voucher, one order per kind, per place — not one per day's city.
    const unassignedGroups: Record<string, {
      docType: string,
      category?: string,
      city: string,
      supplierName: string,
      services: any[],
      dates: { min: string, max: string }
    }> = {}
    const places = new PlaceNames()

    for (const day of days || []) {
      for (const rawService of day.services || []) {
        const serviceDate = day.date

        // Check if this service type should generate a document (tips,
        // water, supplies, a flight… do not).
        const serviceMapping = docMappingFor(rawService)
        if (!serviceMapping || !serviceMapping.docType) continue

        const { docType: serviceDocType, category: serviceCategory } = serviceMapping
        const serviceCityName = places.name(serviceCity(serviceMapping, day))
        // An entrance line names its sites, even when it was saved as the
        // one generic "Entrance Fees" line of the day.
        const service = serviceCategory === 'entrance'
          ? { ...rawService, service_name: entranceLineName(rawService, day.attractions) }
          : rawService

        if (service.supplier_id && suppliersMap[service.supplier_id]) {
          // HAS SUPPLIER - group by supplier
          const supplierId = service.supplier_id
          const supplier = suppliersMap[supplierId]

          if (!supplierGroups[supplierId]) {
            let docType = SUPPLIER_TO_DOC_TYPE[supplier.type] || 
                          serviceDocType || 
                          'service_order'

            supplierGroups[supplierId] = {
              supplier,
              services: [],
              cities: new Set(),
              dates: { min: serviceDate || '', max: serviceDate || '' },
              docType,
              category: serviceCategory
            }
          }

          supplierGroups[supplierId].services.push({
            ...service,
            day_number: day.day_number,
            date: serviceDate,
            city: serviceCityName
          })

          supplierGroups[supplierId].cities.add(serviceCityName)

          if (serviceDate && (!supplierGroups[supplierId].dates.min || serviceDate < supplierGroups[supplierId].dates.min)) {
            supplierGroups[supplierId].dates.min = serviceDate
          }
          if (serviceDate && (!supplierGroups[supplierId].dates.max || serviceDate > supplierGroups[supplierId].dates.max)) {
            supplierGroups[supplierId].dates.max = serviceDate
          }
        } else {
          // NO SUPPLIER - group by kind + place. Meals and entrance fees stay
          // SEPARATE service orders (their titles differ).
          const docTypeNames = DEFAULT_SUPPLIER_NAMES[serviceDocType] || { default: 'Services' }
          const defaultName = docTypeNames[serviceCategory || 'default'] || docTypeNames.default || 'Services'
          const supplierName = `${serviceCityName} ${defaultName}`
          const groupKey = unassignedDocKey(serviceDocType, supplierName)

          if (!unassignedGroups[groupKey]) {
            unassignedGroups[groupKey] = {
              docType: serviceDocType,
              category: serviceCategory,
              city: serviceCityName,
              supplierName,
              services: [],
              dates: { min: serviceDate || '', max: serviceDate || '' }
            }
          }

          unassignedGroups[groupKey].services.push({
            ...service,
            day_number: day.day_number,
            date: serviceDate,
            city: serviceCityName
          })

          if (serviceDate && (!unassignedGroups[groupKey].dates.min || serviceDate < unassignedGroups[groupKey].dates.min)) {
            unassignedGroups[groupKey].dates.min = serviceDate
          }
          if (serviceDate && (!unassignedGroups[groupKey].dates.max || serviceDate > unassignedGroups[groupKey].dates.max)) {
            unassignedGroups[groupKey].dates.max = serviceDate
          }
        }
      }
    }



    // Check for existing documents
    const { data: existingDocs } = await supabase
      .from('supplier_documents')
      .select('supplier_id, document_type, city, supplier_name')
      .eq('itinerary_id', itineraryId)
      .neq('status', 'cancelled')

    const existingSupplierDocKeys = new Set(
      (existingDocs || [])
        .filter(d => d.supplier_id)
        .map(d => `${d.supplier_id}-${d.document_type}`)
    )

    // The same key the groups are made with: kind and title. (It used to be
    // built differently from the group key, so it never matched and every
    // "Generate" made every document again.)
    const existingUnassignedDocKeys = new Set(
      (existingDocs || [])
        .filter(d => !d.supplier_id)
        .map(d => unassignedDocKey(d.document_type, d.supplier_name || ''))
    )

    // Generate documents
    const documentsToCreate: any[] = []

    // 1. Documents for services WITH suppliers
    for (const [supplierId, group] of Object.entries(supplierGroups)) {
      const docKey = `${supplierId}-${group.docType}`
      if (existingSupplierDocKeys.has(docKey)) {

        continue
      }

      if (document_types && !document_types.includes(group.docType)) {
        continue
      }

      const docNumber = await generateDocumentNumber(supabase, group.docType)

      const formattedServices = group.services.map(s => ({
        service_type: s.service_type,
        service_name: s.service_name,
        quantity: s.quantity,
        date: s.date,
        day_number: s.day_number,
        city: s.city,
        notes: s.notes,
        total_cost: s.total_cost
      }))

      const totalCost = group.services.reduce((sum, s) => sum + (parseFloat(s.total_cost) || 0), 0)
      const isHotel = group.docType === 'hotel_voucher'
      const isCruise = group.docType === 'cruise_voucher'

      documentsToCreate.push({
        tenant_id: authResult.tenant_id,
        itinerary_id: itineraryId,
        supplier_id: supplierId,
        document_type: group.docType,
        document_number: docNumber,
        supplier_name: group.supplier.name,
        supplier_contact_name: group.supplier.contact_name,
        supplier_contact_email: group.supplier.contact_email,
        supplier_contact_phone: group.supplier.contact_phone,
        supplier_address: [group.supplier.address, group.supplier.city, group.supplier.country].filter(Boolean).join(', '),
        client_name: itinerary.client_name,
        client_nationality: itinerary.nationality,
        num_adults: itinerary.num_adults || 1,
        num_children: itinerary.num_children || 0,
        services: formattedServices,
        city: Array.from(group.cities).join(', '),
        service_date: (isHotel || isCruise) ? null : group.dates.min,
        check_in: (isHotel || isCruise) ? group.dates.min : null,
        check_out: (isHotel || isCruise) ? group.dates.max : null,
        currency: itinerary.currency || 'EUR',
        total_cost: totalCost,
        payment_terms: group.supplier.payment_terms || 'commission',
        status: 'draft'
      })


    }

    // 2. Documents for services WITHOUT suppliers (grouped by docType + category + city)
    for (const [groupKey, group] of Object.entries(unassignedGroups)) {
      // Check if we should skip
      if (existingUnassignedDocKeys.has(groupKey)) {

        continue
      }

      if (document_types && !document_types.includes(group.docType)) {
        continue
      }

      const docNumber = await generateDocumentNumber(supabase, group.docType)

      const formattedServices = group.services.map(s => ({
        service_type: s.service_type,
        service_name: s.service_name,
        quantity: s.quantity,
        date: s.date,
        day_number: s.day_number,
        city: s.city,
        notes: s.notes,
        total_cost: s.total_cost
      }))

      const totalCost = group.services.reduce((sum, s) => sum + (parseFloat(s.total_cost) || 0), 0)
      const isHotel = group.docType === 'hotel_voucher'
      const isCruise = group.docType === 'cruise_voucher'

      const supplierName = group.supplierName

      documentsToCreate.push({
        tenant_id: authResult.tenant_id,
        itinerary_id: itineraryId,
        supplier_id: null, // No supplier assigned
        document_type: group.docType,
        document_number: docNumber,
        supplier_name: supplierName,
        supplier_contact_name: null,
        supplier_contact_email: null,
        supplier_contact_phone: null,
        supplier_address: group.city,
        client_name: itinerary.client_name,
        client_nationality: itinerary.nationality,
        num_adults: itinerary.num_adults || 1,
        num_children: itinerary.num_children || 0,
        services: formattedServices,
        city: group.city,
        service_date: (isHotel || isCruise) ? null : group.dates.min || itinerary.start_date,
        check_in: (isHotel || isCruise) ? group.dates.min : null,
        check_out: (isHotel || isCruise) ? group.dates.max : null,
        currency: itinerary.currency || 'EUR',
        total_cost: totalCost,
        payment_terms: 'pay_direct',
        status: 'draft'
      })


    }

    // Insert all documents
    if (documentsToCreate.length > 0) {


      const { data: createdDocs, error: createError } = await supabase
        .from('supplier_documents')
        .insert(documentsToCreate)
        .select()

      if (createError) {
        console.error('❌ Error creating documents:', createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }



      return NextResponse.json({
        success: true,
        message: `Generated ${createdDocs.length} document(s)`,
        count: createdDocs.length,
        documents: createdDocs
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