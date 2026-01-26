import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    const body = await request.json()
    const { 
      templateId, 
      channel, 
      clientId,      // Legacy - for clients
      recipientId,   // New - for any recipient
      recipientType, // New - 'client', 'hotel', 'cruise', 'transport', 'guide'
      recipient, 
      subject, 
      body: messageBody 
    } = body

    if (!messageBody || !recipient) {
      return NextResponse.json({ 
        success: false, 
        error: 'Message body and recipient are required' 
      }, { status: 400 })
    }

    let result

    if (channel === 'email') {
      result = await sendEmail(recipient, subject, messageBody, supabase)
    } else if (channel === 'whatsapp') {
      result = await sendWhatsApp(recipient, messageBody)
    } else if (channel === 'sms') {
      result = await sendSMS(recipient, messageBody)
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid channel'
      }, { status: 400 })
    }

    // Log the send - support both old and new fields
    const logEntry: any = {
      tenant_id, // ✅ Explicit tenant_id
      template_id: templateId,
      channel,
      recipient_email: channel === 'email' ? recipient : null,
      recipient_phone: (channel === 'whatsapp' || channel === 'sms') ? recipient : null,
      subject,
      body_preview: messageBody.substring(0, 500),
      status: result.success ? 'sent' : 'failed',
      error_message: result.error,
    }

    // Add recipient info based on type
    if (recipientType && recipientId) {
      logEntry.recipient_type = recipientType
      logEntry.recipient_id = recipientId
      
      // Also set client_id if it's a client (for backwards compatibility)
      if (recipientType === 'client') {
        logEntry.client_id = recipientId
      }
    } else if (clientId) {
      // Legacy support
      logEntry.client_id = clientId
      logEntry.recipient_type = 'client'
      logEntry.recipient_id = clientId
    }

    await supabase.from('template_send_log').insert(logEntry)

    // Update template usage count
    if (templateId) {
      // Fetch current template to get usage_count
      const { data: template } = await supabase
        .from('message_templates')
        .select('usage_count')
        .eq('id', templateId)
        .single()

      await supabase
        .from('message_templates')
        .update({ 
          usage_count: (template?.usage_count || 0) + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', templateId)
    }

    if (!result.success) {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Message sent via ${channel}` 
    })

  } catch (error) {
    console.error('Template send error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// ============================================
// EMAIL SENDING (via Gmail API)
// ============================================

async function sendEmail(to: string, subject: string, body: string, supabase: any): Promise<{ success: boolean; error?: string }> {
  try {
    // Get Gmail tokens from database (RLS filters to tenant's tokens only)
    const { data: tokens } = await supabase
      .from('gmail_tokens')
      .select('*')
      .limit(1)
      .single()

    if (!tokens) {
      // Fallback: Try internal email API if exists
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/gmail/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          body,
          isHtml: false,
        }),
      })

      if (response.ok) {
        return { success: true }
      }

      return { 
        success: false, 
        error: 'Gmail not connected. Please connect your Gmail account in Settings.' 
      }
    }

    // Use Gmail API
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/gmail/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject,
        body,
        isHtml: false,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.message || 'Failed to send email' }
    }

    return { success: true }

  } catch (error: any) {
    console.error('Email send error:', error)
    return { success: false, error: error.message || 'Failed to send email' }
  }
}

// ============================================
// WHATSAPP SENDING (via Twilio)
// ============================================

async function sendWhatsApp(to: string, body: string): Promise<{ success: boolean; error?: string }> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'

    if (!accountSid || !authToken) {
      return {
        success: false,
        error: 'WhatsApp (Twilio) not configured. Please add Twilio credentials.'
      }
    }

    // Format phone number for WhatsApp
    let formattedTo = to.replace(/\s+/g, '').replace(/[^\d+]/g, '')
    if (!formattedTo.startsWith('+')) {
      formattedTo = '+' + formattedTo
    }
    formattedTo = `whatsapp:${formattedTo}`

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: formattedTo,
          Body: body,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      console.error('Twilio error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send WhatsApp message'
      }
    }

    return { success: true }

  } catch (error: any) {
    console.error('WhatsApp send error:', error)
    return { success: false, error: error.message || 'Failed to send WhatsApp message' }
  }
}

// ============================================
// SMS SENDING (via Twilio)
// ============================================

async function sendSMS(to: string, body: string): Promise<{ success: boolean; error?: string }> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_SMS_FROM || process.env.TWILIO_PHONE_NUMBER

    if (!accountSid || !authToken) {
      return {
        success: false,
        error: 'SMS (Twilio) not configured. Please add Twilio credentials.'
      }
    }

    if (!fromNumber) {
      return {
        success: false,
        error: 'SMS sender number not configured. Please set TWILIO_SMS_FROM or TWILIO_PHONE_NUMBER.'
      }
    }

    // Format phone number for SMS
    let formattedTo = to.replace(/\s+/g, '').replace(/[^\d+]/g, '')
    if (!formattedTo.startsWith('+')) {
      formattedTo = '+' + formattedTo
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: formattedTo,
          Body: body,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      console.error('Twilio SMS error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send SMS'
      }
    }

    return { success: true }

  } catch (error: any) {
    console.error('SMS send error:', error)
    return { success: false, error: error.message || 'Failed to send SMS' }
  }
}