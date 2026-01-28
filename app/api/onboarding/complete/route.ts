import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
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

    // Mark onboarding as completed
    const { error } = await supabase
      .from('tenant_features')
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_step: 99, // Completed
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenant_id)

    if (error) {
      console.error('Error completing onboarding:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to complete onboarding' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully'
    })
  } catch (error) {
    console.error('Error in onboarding complete POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
