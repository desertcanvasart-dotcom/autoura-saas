// Tour Calculation API Endpoint
// Location: /app/api/tours/calculate/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { calculateTourPricing, validateTour } from '@/lib/tourCalculator'
import { Tour, TourCalculationInput } from '@/app/tour-builder/types'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const body: TourCalculationInput = await request.json()
    
    const { tour, pax, is_euro_passport } = body

    // Validate input
    if (!tour) {
      return NextResponse.json(
        { success: false, error: 'Tour data is required' },
        { status: 400 }
      )
    }

    if (!pax || pax <= 0) {
      return NextResponse.json(
        { success: false, error: 'Number of passengers must be greater than 0' },
        { status: 400 }
      )
    }

    if (is_euro_passport === undefined || is_euro_passport === null) {
      return NextResponse.json(
        { success: false, error: 'Passport type (Euro/Non-Euro) is required' },
        { status: 400 }
      )
    }

    // Check if tour has any days
    if (!tour.days || tour.days.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tour must have at least one day' },
        { status: 400 }
      )
    }

    // SKIP validation - calculate with whatever data we have
    // Users are still building the tour, we calculate what we can

    // Calculate pricing
    const pricing = calculateTourPricing(tour, pax, is_euro_passport)

    return NextResponse.json({
      success: true,
      data: pricing
    })

  } catch (error) {
    console.error('Tour calculation error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to calculate tour pricing' 
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { 
      success: false, 
      error: 'Use POST method to calculate tour pricing' 
    },
    { status: 405 }
  )
}