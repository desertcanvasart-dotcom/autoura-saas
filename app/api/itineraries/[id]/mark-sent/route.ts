import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/** The statuses a send moves to 'sent'; any later one is kept. */
const PROMOTABLE_TO_SENT = ['draft', 'quoted']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const { id } = await params
    const { sentVia, recipientEmail } = await request.json()

    // Only a trip still at the quote stage becomes 'sent' (RLS keeps it to
    // the tenant). The page calls this after every email and WhatsApp send,
    // so re-sending a confirmed, operating or cancelled trip set it back to
    // 'sent' — undoing the status the send routes themselves leave alone.
    const { data, error } = await supabase
      .from('itineraries')
      .update({
        status: 'sent',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .or(`status.is.null,status.in.(${PROMOTABLE_TO_SENT.join(',')})`)
      .select()
      .maybeSingle()

    if (error) throw error

    // Log the send action (optional - you could create a sends table)
    // For now, we'll just update the main record

    return NextResponse.json({
      success: true,
      data,
      statusChanged: Boolean(data),
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