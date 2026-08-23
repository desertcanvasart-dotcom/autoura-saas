import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

// Lazy-initialized Supabase admin client (avoids build-time errors when env vars unavailable)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// POST - Twilio Status Callback
// This endpoint receives message delivery status updates from Twilio
// SECURITY: Validates Twilio signature before processing
export async function POST(request: NextRequest) {
  try {
    // ============================================
    // SECURITY: Validate Twilio Signature
    // ============================================
    const signature = request.headers.get('x-twilio-signature')
    const url = request.url

    if (!signature) {
      console.error('❌ Missing Twilio signature header on status callback')
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Parse form data for signature validation
    const formData = await request.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    // Validate signature
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      console.error('❌ TWILIO_AUTH_TOKEN not configured')
      return new NextResponse('Server Error', { status: 500 })
    }

    const isValid = twilio.validateRequest(authToken, signature, url, params)

    if (!isValid) {
      console.error('❌ Invalid Twilio signature on status callback - possible unauthorized request')
      return new NextResponse('Forbidden', { status: 403 })
    }



    // Extract status callback data from already-parsed params
    const messageSid = params['MessageSid']
    const messageStatus = params['MessageStatus']
    const errorCode = params['ErrorCode'] || null
    const errorMessage = params['ErrorMessage'] || null
    const to = params['To']
    const from = params['From']



    if (!messageSid) {
      return NextResponse.json({ error: 'Missing MessageSid' }, { status: 400 })
    }

    // Update message status in database.
    //
    // Deliberately NOT `.single()`. A status callback for a SID we have no row
    // for is not an exception, it is a miss — but `.single()` turns it into
    // PGRST116, which the catch below logged with the same words as a database
    // outage. Both then returned 200 and vanished. Every delivery status could
    // have stopped recording without a single distinguishable line in the log.
    //
    // The 200 is correct and stays: a non-2xx makes Twilio retry this callback
    // for hours. The failure has to be visible in the logs instead of in the
    // status code, so the two cases are separated and each is greppable.
    const { data: updated, error } = await (getSupabaseAdmin() as any)
      .from('whatsapp_messages')
      .update({
        status: messageStatus,
        error_code: errorCode,
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('message_sid', messageSid)
      .select('id')

    if (error) {
      // The database refused or was unreachable — this status is lost.
      console.error('[whatsapp/status-callback] DB_ERROR — status not recorded', {
        messageSid,
        messageStatus,
        code: error.code,
        message: error.message,
      })
    } else if (!updated || updated.length === 0) {
      // Signature was valid, so Twilio really did send this on our behalf, but
      // no whatsapp_messages row carries the SID. Either the send never
      // persisted its row, or the callback beat the insert. Silent until now.
      console.error('[whatsapp/status-callback] NO_MATCHING_MESSAGE — status dropped', {
        messageSid,
        messageStatus,
        to,
        from,
      })
    }

    // Log failed messages for debugging
    if (messageStatus === 'failed' || messageStatus === 'undelivered') {
      console.error('❌ Message delivery failed:', {
        messageSid,
        errorCode,
        errorMessage,
        to
      })
    }

    // Twilio expects a 200 OK response
    return new NextResponse('OK', { status: 200 })

  } catch (error) {
    console.error('Status callback error:', error)
    // Always return 200 to Twilio to prevent retries
    return new NextResponse('OK', { status: 200 })
  }
}

// GET - Health check
export async function GET() {
  return NextResponse.json({
    endpoint: 'WhatsApp Status Callback',
    status: 'active',
    description: 'Receives message delivery status updates from Twilio',
    statuses: ['queued', 'sent', 'delivered', 'read', 'failed', 'undelivered']
  })
}
