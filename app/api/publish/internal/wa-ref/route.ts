import { NextRequest, NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { CONTRACT_VERSION, waRefInputSchema } from '@/lib/publish/contract'
import { EnquiryRejected, createWaRef } from '@/lib/publish/enquiries'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================
// Publish (internal) — a visitor clicked a company website's WhatsApp button
// ============================================
// Called by the site renderer only, with PUBLISH_INTERNAL_SECRET. Answers
// with the company's own number and a fresh reference for the message, or
// { number: null } when the company has no number of its own (decision Q7).

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization')
  const authorized = bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET)
    || bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET_PREVIOUS)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const asked = request.nextUrl.searchParams.get('v')
  if (asked !== null && asked !== String(CONTRACT_VERSION)) {
    return NextResponse.json({ error: `contract version ${asked} asked, this app speaks ${CONTRACT_VERSION}` }, { status: 409 })
  }

  const parsed = waRefInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 })

  try {
    return NextResponse.json(await createWaRef(createAdminClient() as never, parsed.data))
  } catch (e) {
    if (e instanceof EnquiryRejected) return NextResponse.json({ error: e.message }, { status: 404 })
    console.error('[publish wa-ref]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'the reference could not be made' }, { status: 500 })
  }
}
