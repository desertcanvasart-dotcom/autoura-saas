import { NextRequest, NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { CONTRACT_VERSION, enquiryInputSchema } from '@/lib/publish/contract'
import { EnquiryRejected, recordWebEnquiry } from '@/lib/publish/enquiries'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'
import { notifyTeam } from '@/lib/notifications'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================
// Publish (internal) — an enquiry form was sent on a company's website
// ============================================
// Called by the site renderer only, with PUBLISH_INTERNAL_SECRET. The
// renderer has already resolved the site from the hostname; the visitor's
// address comes along only for the rate limit (the public contact form's:
// 5 a minute per address). 429 = slow down, 404 = no such site.

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

  const parsed = enquiryInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid enquiry', issues: parsed.error.issues.map(i => i.path.join('.')) }, { status: 400 })
  const input = parsed.data

  const limit = await checkSharedRateLimit(`publish-enquiry:${input.visitorIp ?? 'unknown'}`, 'contact')
  if (!limit.success) return NextResponse.json({ error: 'Too many enquiries — try again in a minute' }, { status: 429 })

  try {
    const { enquiryId } = await recordWebEnquiry(createAdminClient() as never, input, { notify: notifyTeam })
    return NextResponse.json({ ok: true, enquiryId }, { status: 201 })
  } catch (e) {
    if (e instanceof EnquiryRejected) return NextResponse.json({ error: e.message }, { status: 404 })
    console.error('[publish enquiry]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'the enquiry could not be saved' }, { status: 500 })
  }
}
