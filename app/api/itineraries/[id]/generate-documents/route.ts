import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// Map service types to document types
// null = skip (no document needed)
// For service_order, we also track a sub-category to create separate SOs
const SERVICE_TO_DOC_TYPE: Record<string, { docType: string | null, category?: string }> = {
  // Creates Transport Voucher
  transportation: { docType: 'transport_voucher' },
  transport: { docType: 'transport_voucher' },
  transfer: { docType: 'transport_voucher' },
  
  // Creates Guide Assignment
  guide: { docType: 'guide_assignment' },
  
  // Creates Service Order for MEALS
  meal: { docType: 'service_order', category: 'meals' },
  lunch: { docType: 'service_order', category: 'meals' },
  dinner: { docType: 'service_order', category: 'meals' },
  breakfast: { docType: 'service_order', category: 'meals' },
  
  // Creates Service Order for ENTRANCE FEES
  entrance: { docType: 'service_order', category: 'entrance' },
  activity: { docType: 'service_order', category: 'entrance' },
  tour: { docType: 'service_order', category: 'entrance' },
  excursion: { docType: 'service_order', category: 'entrance' },
  
  // Creates Hotel Voucher
  accommodation: { docType: 'hotel_voucher' },
  hotel: { docType: 'hotel_voucher' },
  
  // Creates Cruise Voucher
  cruise: { docType: 'cruise_voucher' },
  
  // NO document needed - skip these
  tips: { docType: null },
  supplies: { docType: null },
  water: { docType: null },
  service_fee: { docType: null }
}

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
  const supabase = createClient()
  const { id: itineraryId } = await params
  
  // Reset offsets for each request
  Object.keys(typeOffsets).forEach(key => delete typeOffsets[key])
  
  try {
    const body = await request.json().catch(() => ({}))
    const { document_types } = body
    
    console.log('📄 Generating documents for itinerary:', itineraryId)
    console.log('📋 Requested types:', document_types || 'ALL')
    
    // Fetch itinerary with client details
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()
    
    if (itinError) {
      console.error('❌ Itinerary fetch error:', itinError)
      return NextResponse.json({ error: 'Itinerary not found', details: itinError.message }, { status: 404 })
    }
    
    if (!itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }
    
    console.log('✅ Found itinerary:', itinerary.itinerary_code)
    
    // Fetch all days with services
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select(`
        *,
        services:itinerary_services(*)
      `)
      .eq('itinerary_id', itineraryId)
      .order('day_number', { ascending: true })
    
    if (daysError) {
      console.error('❌ Days fetch error:', daysError)
      return NextResponse.json({ error: daysError.message }, { status: 500 })
    }
    
    console.log(`✅ Found ${days?.length || 0} days`)
    
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
    
    console.log(`✅ Found ${totalServices} services, ${supplierIds.size} with suppliers`)
    
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
    
    // Group services WITHOUT suppliers by docType + category + city
    const unassignedGroups: Record<string, {
      docType: string,
      category?: string,
      city: string,
      services: any[],
      dates: { min: string, max: string }
    }> = {}
    
    for (const day of days || []) {
      for (const service of day.services || []) {
        const serviceDate = day.date
        const serviceCity = day.city || service.city || 'Cairo'
        
        // Check if this service type should generate a document
        const serviceMapping = SERVICE_TO_DOC_TYPE[service.service_type]
        if (!serviceMapping || serviceMapping.docType === null) {
          // Skip services that don't need documents (tips, water, supplies, service_fee)
          console.log(`⏭️ Skipping ${service.service_type} - no document needed`)
          continue
        }
        
        const { docType: serviceDocType, category: serviceCategory } = serviceMapping
        
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
            city: serviceCity
          })
          
          supplierGroups[supplierId].cities.add(serviceCity)
          
          if (serviceDate && (!supplierGroups[supplierId].dates.min || serviceDate < supplierGroups[supplierId].dates.min)) {
            supplierGroups[supplierId].dates.min = serviceDate
          }
          if (serviceDate && (!supplierGroups[supplierId].dates.max || serviceDate > supplierGroups[supplierId].dates.max)) {
            supplierGroups[supplierId].dates.max = serviceDate
          }
        } else {
          // NO SUPPLIER - group by docType + category + city
          // This ensures meals and entrance fees create SEPARATE service orders
          const groupKey = `${serviceDocType}-${serviceCategory || 'default'}-${serviceCity}`
          
          if (!unassignedGroups[groupKey]) {
            unassignedGroups[groupKey] = {
              docType: serviceDocType,
              category: serviceCategory,
              city: serviceCity,
              services: [],
              dates: { min: serviceDate || '', max: serviceDate || '' }
            }
          }
          
          unassignedGroups[groupKey].services.push({
            ...service,
            day_number: day.day_number,
            date: serviceDate,
            city: serviceCity
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
    
    console.log(`📁 Supplier groups: ${Object.keys(supplierGroups).length}`)
    console.log(`📁 Unassigned groups (by type+city): ${Object.keys(unassignedGroups).length}`)
    for (const [key, group] of Object.entries(unassignedGroups)) {
      console.log(`   - ${key}: ${group.services.length} services`)
    }
    
    // Check for existing documents
    const { data: existingDocs } = await supabase
      .from('supplier_documents')
      .select('supplier_id, document_type, city')
      .eq('itinerary_id', itineraryId)
      .neq('status', 'cancelled')
    
    const existingSupplierDocKeys = new Set(
      (existingDocs || [])
        .filter(d => d.supplier_id)
        .map(d => `${d.supplier_id}-${d.document_type}`)
    )
    
    const existingUnassignedDocKeys = new Set(
      (existingDocs || [])
        .filter(d => !d.supplier_id)
        .map(d => `${d.document_type}-${d.city || 'General'}`)
    )
    
    // Generate documents
    const documentsToCreate: any[] = []
    
    // 1. Documents for services WITH suppliers
    for (const [supplierId, group] of Object.entries(supplierGroups)) {
      const docKey = `${supplierId}-${group.docType}`
      if (existingSupplierDocKeys.has(docKey)) {
        console.log(`⏭️ Skipping existing: ${docKey}`)
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
        client_nationality: itinerary.client_nationality,
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
      
      console.log(`📝 Will create (supplier): ${docNumber} - ${group.supplier.name}`)
    }
    
    // 2. Documents for services WITHOUT suppliers (grouped by docType + category + city)
    for (const [groupKey, group] of Object.entries(unassignedGroups)) {
      // Check if we should skip
      if (existingUnassignedDocKeys.has(groupKey)) {
        console.log(`⏭️ Skipping existing unassigned: ${groupKey}`)
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
      
      // Generate a meaningful supplier name based on document type, category, and city
      const docTypeNames = DEFAULT_SUPPLIER_NAMES[group.docType] || { default: 'Services' }
      const defaultName = (typeof docTypeNames === 'object' 
        ? (docTypeNames[group.category || 'default'] || docTypeNames.default)
        : docTypeNames) || 'Services'
      const supplierName = `${group.city} ${defaultName}`
      
      documentsToCreate.push({
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
        client_nationality: itinerary.client_nationality,
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
      
      console.log(`📝 Will create (unassigned): ${docNumber} - ${supplierName}`)
    }
    
    // Insert all documents
    if (documentsToCreate.length > 0) {
      console.log(`💾 Inserting ${documentsToCreate.length} documents...`)
      
      const { data: createdDocs, error: createError } = await supabase
        .from('supplier_documents')
        .insert(documentsToCreate)
        .select()
      
      if (createError) {
        console.error('❌ Error creating documents:', createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
      
      console.log(`🎉 Successfully created ${createdDocs.length} documents`)
      
      return NextResponse.json({
        success: true,
        message: `Generated ${createdDocs.length} document(s)`,
        count: createdDocs.length,
        documents: createdDocs
      })
    }
    
    console.log('⚠️ No documents to create')
    
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