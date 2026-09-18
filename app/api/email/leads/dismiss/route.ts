import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { bareAddress } from '@/lib/email/office-addresses'

// ============================================
// "Not a lead", remembered
// ============================================
// Email is judged once and a travel request becomes a client at status 'lead'.
// A judgement can be wrong — a supplier's newsletter, a forwarded thread, a
// job application that mentions Egypt. Dismissing it has to STICK: without a
// record the same sender writes again, the same judgement runs, and the same
// wrong lead comes back on the next sync (migration 368).
//
// The sender is remembered, not the message: somebody who is not a customer
// does not become one by writing twice.

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const sender = bareAddress(typeof body.sender_email === 'string' ? body.sender_email : '')
  if (!sender.includes('@')) {
    return NextResponse.json({ success: false, error: 'A sender email address is required' }, { status: 400 })
  }

  const { error } = await auth.supabase!
    .from('email_lead_dismissals')
    .upsert(
      {
        tenant_id: auth.tenant_id!,
        sender_email: sender,
        dismissed_by: auth.user!.id,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
      },
      { onConflict: 'tenant_id,sender_email' }
    )

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `Mail from ${sender} will not be read as a travel enquiry again.`,
  })
}
