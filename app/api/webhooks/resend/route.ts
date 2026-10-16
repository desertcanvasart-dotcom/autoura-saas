// ============================================
// POST /api/webhooks/resend — bounce and complaint reports from Resend
// ============================================
// Signed by Resend (Svix): the svix-id, svix-timestamp and svix-signature
// headers, HMAC-SHA256 over "id.timestamp.body" with RESEND_WEBHOOK_SECRET
// ("whsec_…", base64 after the prefix). No secret configured = refused.
// email.bounced and email.complained put the recipients on the suppression
// list (lib/email-suppression); every other event is acknowledged and ignored.
//
// Set up: Resend dashboard → Webhooks → endpoint <APP_URL>/api/webhooks/resend
// with the email.bounced and email.complained events; copy its signing
// secret into RESEND_WEBHOOK_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { suppressAddress } from '@/lib/email-suppression'
import { verifySvix } from '@/lib/svix'

export const dynamic = 'force-dynamic'

type ResendEvent = {
  type?: string
  data?: { to?: string[] | string; bounce?: { type?: string; message?: string } }
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const ok = verifySvix(process.env.RESEND_WEBHOOK_SECRET, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  }, body)
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  let event: ResendEvent
  try {
    event = JSON.parse(body) as ResendEvent
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const reason = event.type === 'email.bounced' ? 'bounced' : event.type === 'email.complained' ? 'complained' : null
  if (!reason) return NextResponse.json({ received: true })

  const to = Array.isArray(event.data?.to) ? event.data!.to : event.data?.to ? [event.data.to] : []
  const detail = event.data?.bounce ? [event.data.bounce.type, event.data.bounce.message].filter(Boolean).join(': ') : null
  try {
    for (const address of to) await suppressAddress(String(address), reason, detail)
  } catch (err) {
    // A 500 makes Resend retry: the address must not be lost.
    console.error('[webhooks/resend] could not record suppression:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Not recorded' }, { status: 500 })
  }
  return NextResponse.json({ received: true, suppressed: to.length })
}
