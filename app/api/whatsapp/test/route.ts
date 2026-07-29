import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { requireAuth } from '@/lib/supabase-server'

const ROLE_RANK: Record<string, number> = {
  viewer: 1, member: 2, agent: 2, manager: 3, admin: 4, owner: 5,
}

export async function POST(request: NextRequest) {
  try {
    // This route sends a real, billed Twilio message to any number in the
    // body. It had no auth check, no role check and no rate limit, so any
    // authenticated user — including a viewer — could use the platform's
    // Twilio account to message arbitrary numbers, with nothing recorded.
    // Restricted to admins: it exists to prove an integration works, which
    // is a settings-level action.
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    if ((ROLE_RANK[auth.role || ''] || 0) < ROLE_RANK.admin) {
      return NextResponse.json(
        { success: false, error: 'Only an admin can send a test message' },
        { status: 403 }
      )
    }

    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      )
    }

    const result = await sendWhatsAppMessage({
      to: phone,
      body: `✅ Test message from Autoura\n\nYour WhatsApp integration is working correctly.\n\nSent at: ${new Date().toLocaleString()}`,
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        warning: result.warning,
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send test message' },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('WhatsApp test error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
