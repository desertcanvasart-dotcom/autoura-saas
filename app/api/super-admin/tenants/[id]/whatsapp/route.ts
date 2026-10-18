// PUT /api/super-admin/tenants/[id]/whatsapp — the company's own WhatsApp
// number (migration 408). The Autoura team only: the number must be a sender
// in the platform's Twilio account, and a company that could set any number
// could take another's customers (travel-ops-pro, round 14).
// Body: { whatsapp_number: "+81…" | "", force?: true } — blank goes back to
// the shared number. The number is checked with Twilio first (a WhatsApp
// sender in the account, and live); `force` saves it when that check fails —
// a sender still pending approval, or Twilio unreachable.

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { checkTenantWhatsAppNumber, checkWhatsAppSender } from '@/lib/whatsapp-tenant'
import { listWhatsAppSenders } from '@/lib/twilio-whatsapp'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const checked = checkTenantWhatsAppNumber(body?.whatsapp_number)
    if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: checked.status })

    let senderStatus: string | null = null
    if (checked.number) {
      const sender = await checkWhatsAppSender(checked.number, listWhatsAppSenders)
      if (sender.ok) senderStatus = sender.status
      else if (body?.force !== true) {
        // canForce: the page offers "Save anyway".
        return NextResponse.json({ success: false, error: sender.error, reason: sender.reason, canForce: true }, { status: 422 })
      }
    }

    const { data, error } = await admin
      .from('tenants')
      .update({ whatsapp_number: checked.number })
      .eq('id', id)
      .select('id, whatsapp_number')
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'That number already belongs to another company.' }, { status: 409 })
      }
      if (error.code === '42703' || /whatsapp_number/.test(error.message) && /column/i.test(error.message)) {
        return NextResponse.json({ success: false, error: 'Run migration 408 (tenant WhatsApp number) first.' }, { status: 503 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 })

    return NextResponse.json({ success: true, whatsapp_number: data.whatsapp_number, sender_status: senderStatus })
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
