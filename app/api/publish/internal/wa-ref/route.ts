import { NextRequest, NextResponse } from 'next/server'
import { waRefInputSchema } from '@/lib/publish/contract'
import { EnquiryRejected, createWaRef } from '@/lib/publish/enquiries'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'
import { createAdminClient } from '@/lib/supabase-server'
import { publishInternalDenied, publishInternalFailed } from '@/lib/publish/internal-route'

// ============================================
// Publish (internal) — a visitor clicked a company website's WhatsApp button
// ============================================
// Called by the site renderer only, with PUBLISH_INTERNAL_SECRET. Answers
// with the company's own number and a fresh reference for the message, or
// { number: null } when the company has no number of its own (decision Q7).
// Each reference is a row, so clicks are limited per visitor address and per
// site; past either, the answer carries the number but no reference — the
// button still opens WhatsApp, only untracked.

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const denied = publishInternalDenied(request)
  if (denied) return denied

  const parsed = waRefInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 })

  const input = parsed.data
  const visitor = input.visitorIp ? await checkSharedRateLimit(`publish-wa:${input.visitorIp}`, 'publishWaVisitor') : null
  const site = visitor && !visitor.success ? null : await checkSharedRateLimit(`publish-wa-site:${input.siteId}`, 'publishWaSite')
  const reference = !!site?.success

  try {
    return NextResponse.json(await createWaRef(createAdminClient() as never, input, { reference }))
  } catch (e) {
    if (e instanceof EnquiryRejected) return NextResponse.json({ error: e.message }, { status: 404 })
    return publishInternalFailed('wa-ref', e, 'the reference could not be made')
  }
}
