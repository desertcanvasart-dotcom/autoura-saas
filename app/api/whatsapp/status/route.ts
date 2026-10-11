import { NextResponse } from 'next/server'
import { whatsAppProviderStatus } from '@/lib/whatsapp'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { sharedWhatsAppNumber, toWhatsAppE164 } from '@/lib/whatsapp-tenant'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ configured: false, error: auth.error }, { status: auth.status })
    }
    const { provider, configured } = whatsAppProviderStatus()

    let hasCredentials: boolean
    let hasNumber: boolean
    let phoneNumber = ''

    if (provider === 'meta') {
      hasCredentials = !!process.env.META_WHATSAPP_ACCESS_TOKEN
      hasNumber = !!process.env.META_WHATSAPP_PHONE_NUMBER_ID
      // Cloud API config carries the phone number ID, not the display number.
      phoneNumber = process.env.BUSINESS_WHATSAPP || ''
    } else {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken = process.env.TWILIO_AUTH_TOKEN
      const apiKey = process.env.TWILIO_API_KEY
      const apiSecret = process.env.TWILIO_API_SECRET
      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER

      hasCredentials = !!(accountSid && (authToken || (apiKey && apiSecret)))
      hasNumber = !!whatsappFrom
      phoneNumber = whatsappFrom?.replace('whatsapp:', '') || ''
    }

    // The number THIS company's customers see (migration 408): its own when
    // the Autoura team has set one, else the shared platform number.
    let ownNumber: string | null = null
    if (provider === 'twilio' && auth.tenant_id) {
      const { data } = await createAdminClient()
        .from('tenants').select('whatsapp_number').eq('id', auth.tenant_id).maybeSingle()
      ownNumber = toWhatsAppE164((data as { whatsapp_number?: string | null } | null)?.whatsapp_number)
    }
    const sendingFrom = ownNumber ?? (provider === 'twilio' ? sharedWhatsAppNumber() : null) ?? phoneNumber

    return NextResponse.json({
      configured,
      provider,
      has_credentials: hasCredentials,
      has_number: hasNumber || !!ownNumber,
      whatsapp_number: sendingFrom,
      // true = the company's own number; false = the shared platform number.
      own_number: !!ownNumber,
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
      provider: 'twilio',
      has_credentials: false,
      has_number: false,
      whatsapp_number: '',
      features: { auto_send: false, status_updates: false },
    })
  }
}
