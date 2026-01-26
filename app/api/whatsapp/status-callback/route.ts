import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

    console.log('✅ Twilio signature validated for status callback')

    // Extract status callback data from already-parsed params
    const messageSid = params['MessageSid']
    const messageStatus = params['MessageStatus']
    const errorCode = params['ErrorCode'] || null
    const errorMessage = params['ErrorMessage'] || null
    const to = params['To']
    const from = params['From']

    console.log('📊 Status Callback:', {
      messageSid,
      messageStatus,
      errorCode,
      to,
      from
    })

    if (!messageSid) {
      return NextResponse.json({ error: 'Missing MessageSid' }, { status: 400 })
    }

    // Update message status in database
    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .update({
        status: messageStatus,
        error_code: errorCode,
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('message_sid', messageSid)
      .select()
      .single()

    if (error) {
      console.error('Error updating message status:', error)
      // Don't return error - Twilio expects 200 OK
    } else {
      console.log('✅ Message status updated:', messageSid, '→', messageStatus)
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
