import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { z } from 'zod'

// ============================================
// VALIDATION SCHEMA
// ============================================

const ProfileUpdateSchema = z.object({
  full_name: z.string().min(1).max(255).trim().optional(),
  phone: z.string().max(50).trim().optional().nullable(),
  timezone: z.string().max(100).optional(),
  company_name: z.string().max(255).trim().optional().nullable(),
})

// ============================================
// SECURE SUPABASE CLIENT
// ============================================

async function createSecureClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // Use ANON key, not service role!
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle cookie errors
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle cookie errors
          }
        },
      },
    }
  )
}

// ============================================
// GET - Get current user's profile
// ============================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSecureClient()
    
    // Get authenticated user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }
    
    // Get profile - RLS will ensure they can only get their own
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (error) {
      console.error('Error fetching profile:', error)
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: profile
    })
  } catch (error) {
    console.error('Profile GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ============================================
// PUT - Update current user's profile
// ============================================

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSecureClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }
    
    // Parse and validate input
    const body = await request.json()
    const validation = ProfileUpdateSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.issues
        },
        { status: 400 }
      )
    }
    
    const updateData = validation.data
    
    // Filter out undefined values
    const cleanData = Object.fromEntries(
      Object.entries(updateData).filter(([_, v]) => v !== undefined)
    )
    
    if (Object.keys(cleanData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }
    
    // Update profile - RLS ensures they can only update their own
    const { data, error } = await supabase
      .from('user_profiles')
      .update(cleanData)
      .eq('id', user.id)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating profile:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update profile' },
        { status: 500 }
      )
    }
    
    // Optional: Log the update for audit
    // await logAudit(user.id, 'UPDATE', 'user_profiles', user.id, oldProfile, data)
    
    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Profile PUT error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}