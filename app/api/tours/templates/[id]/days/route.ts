// ============================================
// TOUR DAY ACTIVITIES API
// File: app/api/tours/templates/[id]/days/route.ts
//
// CRUD for template day activities
// Links to Content Library for auto-pricing
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// GET - List all days/activities for a template
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params

    // Fetch template info
    const { data: template, error: templateError } = await supabaseAdmin
      .from('tour_templates')
      .select('id, template_name, template_code, duration_days')
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      )
    }

    // Fetch all activities with content library data
    const { data: activities, error: activitiesError } = await supabaseAdmin
      .from('tour_day_activities')
      .select(`
        id,
        day_number,
        sequence_order,
        content_id,
        activity_type,
        activity_name,
        city,
        duration_hours,
        start_time,
        is_optional,
        is_included,
        requires_guide,
        notes,
        internal_notes,
        created_at,
        content_library (
          id,
          name,
          slug,
          short_description,
          location,
          duration,
          tags,
          content_categories (
            id,
            name,
            slug,
            icon
          )
        )
      `)
      .eq('template_id', templateId)
      .order('day_number')
      .order('sequence_order')

    if (activitiesError) {
      console.error('Error fetching activities:', activitiesError)
      return NextResponse.json(
        { success: false, error: activitiesError.message },
        { status: 500 }
      )
    }

    // Group activities by day
    const dayMap = new Map<number, any[]>()
    for (let d = 1; d <= template.duration_days; d++) {
      dayMap.set(d, [])
    }

    for (const activity of activities || []) {
      const dayNum = activity.day_number
      if (!dayMap.has(dayNum)) {
        dayMap.set(dayNum, [])
      }
      dayMap.get(dayNum)!.push(activity)
    }

    // Convert to array format
    const days = Array.from(dayMap.entries()).map(([dayNumber, activities]) => ({
      day_number: dayNumber,
      activities
    }))

    return NextResponse.json({
      success: true,
      data: {
        template_id: templateId,
        template_name: template.template_name,
        duration_days: template.duration_days,
        days,
        total_activities: activities?.length || 0
      }
    })

  } catch (error: any) {
    console.error('❌ Error fetching days:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// ============================================
// POST - Add activity to a day
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const body = await request.json()

    const {
      day_number,
      content_id,
      activity_type,
      activity_name,
      city,
      duration_hours,
      start_time,
      is_optional = false,
      is_included = true,
      requires_guide = true,
      notes,
      internal_notes,
      // Batch mode
      activities // Array of activities to add
    } = body

    // Batch insert mode
    if (activities && Array.isArray(activities)) {
      const activitiesToInsert = activities.map((act, index) => ({
        template_id: templateId,
        day_number: act.day_number,
        sequence_order: act.sequence_order || index + 1,
        content_id: act.content_id || null,
        activity_type: act.activity_type,
        activity_name: act.activity_name,
        city: act.city || null,
        duration_hours: act.duration_hours || null,
        start_time: act.start_time || null,
        is_optional: act.is_optional ?? false,
        is_included: act.is_included ?? true,
        requires_guide: act.requires_guide ?? true,
        notes: act.notes || null,
        internal_notes: act.internal_notes || null
      }))

      const { data: inserted, error } = await supabaseAdmin
        .from('tour_day_activities')
        .insert(activitiesToInsert)
        .select()

      if (error) {
        console.error('Error batch inserting activities:', error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      // Mark template as using day builder
      await supabaseAdmin
        .from('tour_templates')
        .update({ uses_day_builder: true })
        .eq('id', templateId)

      return NextResponse.json({
        success: true,
        data: inserted,
        message: `Added ${inserted?.length || 0} activities`
      }, { status: 201 })
    }

    // Single insert mode
    if (!day_number || !activity_type || !activity_name) {
      return NextResponse.json(
        { success: false, error: 'day_number, activity_type, and activity_name are required' },
        { status: 400 }
      )
    }

    // Get next sequence order for this day
    const { data: existing } = await supabaseAdmin
      .from('tour_day_activities')
      .select('sequence_order')
      .eq('template_id', templateId)
      .eq('day_number', day_number)
      .order('sequence_order', { ascending: false })
      .limit(1)

    const nextSequence = (existing?.[0]?.sequence_order || 0) + 1

    // If content_id provided, fetch content info to auto-fill fields
    let contentData = null
    if (content_id) {
      const { data } = await supabaseAdmin
        .from('content_library')
        .select('name, location, duration')
        .eq('id', content_id)
        .single()
      contentData = data
    }

    const { data: activity, error } = await supabaseAdmin
      .from('tour_day_activities')
      .insert({
        template_id: templateId,
        day_number,
        sequence_order: nextSequence,
        content_id: content_id || null,
        activity_type,
        activity_name: activity_name || contentData?.name,
        city: city || contentData?.location || null,
        duration_hours: duration_hours || null,
        start_time: start_time || null,
        is_optional,
        is_included,
        requires_guide,
        notes,
        internal_notes
      })
      .select(`
        *,
        content_library (
          id,
          name,
          short_description,
          location,
          content_categories (
            name,
            slug
          )
        )
      `)
      .single()

    if (error) {
      console.error('Error inserting activity:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Mark template as using day builder
    await supabaseAdmin
      .from('tour_templates')
      .update({ uses_day_builder: true })
      .eq('id', templateId)

    return NextResponse.json({
      success: true,
      data: activity
    }, { status: 201 })

  } catch (error: any) {
    console.error('❌ Error adding activity:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// ============================================
// PATCH - Update activity or reorder
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const body = await request.json()

    const { activity_id, ...updates } = body

    // Reorder mode: update multiple activities' sequence
    if (body.reorder && Array.isArray(body.reorder)) {
      const updates = body.reorder.map((item: { id: string; sequence_order: number; day_number?: number }) => 
        supabaseAdmin
          .from('tour_day_activities')
          .update({ 
            sequence_order: item.sequence_order,
            ...(item.day_number ? { day_number: item.day_number } : {})
          })
          .eq('id', item.id)
          .eq('template_id', templateId)
      )

      await Promise.all(updates)

      return NextResponse.json({
        success: true,
        message: `Reordered ${body.reorder.length} activities`
      })
    }

    // Single update mode
    if (!activity_id) {
      return NextResponse.json(
        { success: false, error: 'activity_id is required' },
        { status: 400 }
      )
    }

    // Remove fields that shouldn't be updated directly
    delete updates.id
    delete updates.template_id
    delete updates.created_at

    const { data: activity, error } = await supabaseAdmin
      .from('tour_day_activities')
      .update(updates)
      .eq('id', activity_id)
      .eq('template_id', templateId)
      .select(`
        *,
        content_library (
          id,
          name,
          short_description,
          location
        )
      `)
      .single()

    if (error) {
      console.error('Error updating activity:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: activity
    })

  } catch (error: any) {
    console.error('❌ Error updating activity:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// ============================================
// DELETE - Remove activity
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const { searchParams } = new URL(request.url)
    
    const activityId = searchParams.get('activity_id')
    const dayNumber = searchParams.get('day_number')
    const clearAll = searchParams.get('clear_all') === 'true'

    // Clear all activities for template
    if (clearAll) {
      const { error } = await supabaseAdmin
        .from('tour_day_activities')
        .delete()
        .eq('template_id', templateId)

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      // Reset uses_day_builder flag
      await supabaseAdmin
        .from('tour_templates')
        .update({ uses_day_builder: false })
        .eq('id', templateId)

      return NextResponse.json({
        success: true,
        message: 'Cleared all activities'
      })
    }

    // Clear all activities for a specific day
    if (dayNumber && !activityId) {
      const { error } = await supabaseAdmin
        .from('tour_day_activities')
        .delete()
        .eq('template_id', templateId)
        .eq('day_number', parseInt(dayNumber))

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: `Cleared activities for day ${dayNumber}`
      })
    }

    // Delete single activity
    if (!activityId) {
      return NextResponse.json(
        { success: false, error: 'activity_id is required' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('tour_day_activities')
      .delete()
      .eq('id', activityId)
      .eq('template_id', templateId)

    if (error) {
      console.error('Error deleting activity:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Check if any activities remain
    const { count } = await supabaseAdmin
      .from('tour_day_activities')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', templateId)

    // If no activities, reset flag
    if (count === 0) {
      await supabaseAdmin
        .from('tour_templates')
        .update({ uses_day_builder: false })
        .eq('id', templateId)
    }

    return NextResponse.json({
      success: true,
      message: 'Activity deleted'
    })

  } catch (error: any) {
    console.error('❌ Error deleting activity:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
