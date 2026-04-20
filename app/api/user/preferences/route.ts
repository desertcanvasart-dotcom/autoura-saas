import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

const SUPPORTED_LOCALES = ['en', 'ar', 'fr', 'de', 'es', 'it', 'ja', 'zh']

// GET /api/user/preferences
export async function GET() {
  try {
    const supabase = await createAuthenticatedClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('preferred_language, timezone')
      .eq('id', user.id)
      .single()

    if (error) {
      return NextResponse.json({ preferred_language: 'en', timezone: 'UTC' })
    }

    return NextResponse.json(profile)
  } catch (error) {
    console.error('Error fetching user preferences:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/user/preferences
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { preferred_language, timezone } = body

    if (preferred_language && !SUPPORTED_LOCALES.includes(preferred_language)) {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 })
    }

    const updateData: Record<string, string> = {}
    if (preferred_language) updateData.preferred_language = preferred_language
    if (timezone) updateData.timezone = timezone

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', user.id)

    if (error) {
      console.error('Error updating user preferences:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, ...updateData })
  } catch (error) {
    console.error('Error updating user preferences:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
