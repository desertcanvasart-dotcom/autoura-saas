import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    const { id } = await params
    const { sentVia, recipientEmail } = await request.json()

    // Update itinerary status to 'sent' - RLS ensures tenant isolation
    const { data, error } = await supabase
      .from('itineraries')
      .update({
        status: 'sent',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Log the send action (optional - you could create a sends table)
    // For now, we'll just update the main record

    return NextResponse.json({
      success: true,
      data,
      message: `Quote sent via ${sentVia}`
    })

  } catch (error) {
    console.error('Error updating itinerary status:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}