import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const apiKey = process.env.TWILIO_API_KEY
    const apiSecret = process.env.TWILIO_API_SECRET
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER

    const hasCredentials = !!(accountSid && (authToken || (apiKey && apiSecret)))
    const hasNumber = !!whatsappFrom

    // Extract just the phone number (remove "whatsapp:" prefix)
    const phoneNumber = whatsappFrom?.replace('whatsapp:', '') || ''

    return NextResponse.json({
      configured: hasCredentials && hasNumber,
      has_credentials: hasCredentials,
      has_number: hasNumber,
      whatsapp_number: phoneNumber,
      business_name: process.env.BUSINESS_NAME || '',
      business_whatsapp: process.env.BUSINESS_WHATSAPP || '',
      features: {
        auto_send: process.env.ENABLE_WHATSAPP_AUTO_SEND === 'true',
        status_updates: process.env.ENABLE_WHATSAPP_STATUS_UPDATES === 'true',
      },
    })
  } catch (error) {
    console.error('WhatsApp status check error:', error)
    return NextResponse.json({
      configured: false,
      has_credentials: false,
      has_number: false,
      whatsapp_number: '',
      features: { auto_send: false, status_updates: false },
    })
  }
}
