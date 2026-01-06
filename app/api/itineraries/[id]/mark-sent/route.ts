import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { sentVia, recipientEmail } = await request.json()

    // Update itinerary status to 'sent'
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