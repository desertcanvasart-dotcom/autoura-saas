// Save Tour API Endpoint
// Location: /app/api/tours/save/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
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
    const { tour, pax, is_euro_passport, pricing } = await request.json()

    // 1. Save main tour
    const { data: tourData, error: tourError } = await supabase
      .from('tours')
      .insert({
        tenant_id, // ✅ Explicit tenant_id
        tour_code: tour.tour_code,
        tour_name: tour.tour_name,
        duration_days: tour.duration_days,
        cities: tour.cities,
        tour_type: tour.tour_type,
        is_template: tour.is_template || false,
        description: tour.description,
        created_by: 'system' // You can add user auth later
      })
      .select()
      .single()

    if (tourError) {
      console.error('Error saving tour:', tourError)
      return NextResponse.json(
        { success: false, error: tourError.message },
        { status: 500 }
      )
    }

    const savedTourId = tourData.id

    // 2. Save tour days
    if (tour.days && tour.days.length > 0) {
      const daysToInsert = tour.days.map((day: any) => ({
        tenant_id, // ✅ Explicit tenant_id
        tour_id: savedTourId,
        day_number: day.day_number,
        city: day.city,
        accommodation_id: day.accommodation?.id || null,
        breakfast_included: day.breakfast_included,
        lunch_meal_id: day.lunch_meal?.id || null,
        dinner_meal_id: day.dinner_meal?.id || null,
        guide_required: day.guide_required,
        guide_id: day.guide?.id || null,
        notes: day.notes || null
      }))

      const { data: daysData, error: daysError } = await supabase
        .from('tour_days')
        .insert(daysToInsert)
        .select()

      if (daysError) {
        console.error('Error saving tour days:', daysError)
        // Rollback: delete the tour
        await supabase.from('tours').delete().eq('id', savedTourId)
        return NextResponse.json(
          { success: false, error: daysError.message },
          { status: 500 }
        )
      }

      // 3. Save activities for each day
      for (let i = 0; i < tour.days.length; i++) {
        const day = tour.days[i]
        const savedDay = daysData[i]

        if (day.activities && day.activities.length > 0) {
          const activitiesToInsert = day.activities.map((activity: any) => ({
            tenant_id, // ✅ Explicit tenant_id
            tour_day_id: savedDay.id,
            activity_order: activity.activity_order,
            entrance_id: activity.entrance?.id || null,
            transportation_id: activity.transportation?.id || null,
            activity_notes: activity.activity_notes || null
          }))

          const { error: activitiesError } = await supabase
            .from('tour_day_activities')
            .insert(activitiesToInsert)

          if (activitiesError) {
            console.error('Error saving activities:', activitiesError)
          }
        }
      }
    }

    // 4. Save pricing if provided
    if (pricing) {
      await supabase.from('tour_pricing').insert({
        tenant_id, // ✅ Explicit tenant_id
        tour_id: savedTourId,
        pax: pax,
        is_euro_passport: is_euro_passport,
        total_accommodation: pricing.totals.total_accommodation,
        total_meals: pricing.totals.total_meals,
        total_guides: pricing.totals.total_guides,
        total_transportation: pricing.totals.total_transportation,
        total_entrances: pricing.totals.total_entrances,
        grand_total: pricing.totals.grand_total,
        per_person_total: pricing.per_person
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        tour_id: savedTourId,
        tour_code: tour.tour_code,
        tour_name: tour.tour_name
      },
      message: 'Tour saved successfully!'
    })

  } catch (error) {
    console.error('Save tour error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to save tour' 
      },
      { status: 500 }
    )
  }
}