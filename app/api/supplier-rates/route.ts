// API Route: /api/supplier-rates
// Unified endpoint to fetch rates linked to a specific supplier
// Used by Suppliers page "Rates" tab

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase admin client (avoids build-time errors when env vars unavailable)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// Map supplier type to rate table(s)
const SUPPLIER_RATE_TABLES: Record<string, string[]> = {
  transport_company: ['transportation_rates', 'vehicle_rates'],
  transport: ['transportation_rates', 'vehicle_rates'],
  driver: ['transportation_rates'],
  hotel: ['accommodation_rates', 'seasonal_rates'],
  guide: ['guide_rates', 'assistant_rates'],
  cruise: ['nile_cruises', 'seasonal_rates'],
  activity_provider: ['activity_rates'],
  attraction: ['activity_rates'],
  restaurant: ['meal_rates'],
  tour_operator: ['train_rates', 'sleeping_train_rates'],
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const supplierType = searchParams.get('supplier_type')

    if (!supplierId) {
      return NextResponse.json({ 
        success: false, 
        error: 'supplier_id is required' 
      }, { status: 400 })
    }

    // If supplier_type provided, use it to determine tables
    // Otherwise, fetch all possible rate tables
    let rateTables = supplierType 
      ? SUPPLIER_RATE_TABLES[supplierType] || []
      : Object.values(SUPPLIER_RATE_TABLES).flat()
    
    // Remove duplicates
    rateTables = [...new Set(rateTables)]

    const allRates: Record<string, any[]> = {}

    // Fetch rates from each table
    for (const table of rateTables) {
      try {
        const { data, error } = await getSupabaseAdmin()
          .from(table)
          .select('*')
          .eq('supplier_id', supplierId)
          .order('created_at', { ascending: false })

        if (!error && data && data.length > 0) {
          allRates[table] = data
        }
      } catch (e) {
        // Table might not have supplier_id yet, skip
        console.log(`Skipping ${table}: ${e}`)
      }
    }

    // Flatten for simple response or keep grouped
    const flattenedRates = Object.entries(allRates).flatMap(([table, rates]) => 
      rates.map(rate => ({ ...rate, _rate_type: table }))
    )

    return NextResponse.json({ 
      success: true, 
      data: flattenedRates,
      grouped: allRates,
      count: flattenedRates.length
    })
  } catch (error: any) {
    console.error('Error fetching supplier rates:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}