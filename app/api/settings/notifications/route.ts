import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - Fetch notification preferences
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by user
    const supabase = await createAuthenticatedClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Try to get from user_settings table
    const { data, error } = await supabase
      .from('user_settings')
      .select('notification_preferences')
      .eq('user_id', user.id)
      .single()

    if (data?.notification_preferences) {
      return NextResponse.json(data.notification_preferences)
    }

    // Return defaults if no settings exist
    return NextResponse.json({
      task_assigned: true,
      task_due_soon: true,
      task_overdue: true,
      task_completed: false,
      email_enabled: true,
      in_app_enabled: true
    })
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    // Return defaults on error
    return NextResponse.json({
      task_assigned: true,
      task_due_soon: true,
      task_overdue: true,
      task_completed: false,
      email_enabled: true,
      in_app_enabled: true
    })
  }
}

// PUT - Update notification preferences
export async function PUT(request: NextRequest) {
  try {
    // Require authentication and get user info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    const preferences = await request.json()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Validate the preferences object
    const validPrefs = {
      task_assigned: Boolean(preferences.task_assigned),
      task_due_soon: Boolean(preferences.task_due_soon),
      task_overdue: Boolean(preferences.task_overdue),
      task_completed: Boolean(preferences.task_completed),
      email_enabled: Boolean(preferences.email_enabled),
      in_app_enabled: Boolean(preferences.in_app_enabled)
    }

    // Upsert to user_settings table (scoped to current user)
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id, // ✅ Explicit user_id
        notification_preferences: validPrefs,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('Error saving notification settings:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to save notification settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: validPrefs
    })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update notification settings' },
      { status: 500 }
    )
  }
}