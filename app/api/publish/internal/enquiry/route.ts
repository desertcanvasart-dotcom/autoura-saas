import { NextRequest, NextResponse } from 'next/server'
import { enquiryInputSchema } from '@/lib/publish/contract'
import { EnquiryRejected, recordWebEnquiry } from '@/lib/publish/enquiries'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'
import { notifyTeam } from '@/lib/notifications'
import { createAdminClient } from '@/lib/supabase-server'
import { publishInternalDenied, publishInternalFailed } from '@/lib/publish/internal-route'

// ============================================
// Publish (internal) — an enquiry form was sent on a company's website
// ============================================
// Called by the site renderer only, with PUBLISH_INTERNAL_SECRET. The
// renderer has already resolved the site from the hostname; the visitor's
// address comes along only for the rate limit (the public contact form's:
// 5 a minute per address), and each site has an hourly ceiling
// (publishEnquirySite). 429 = slow down, 404 = no such site.

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const denied = publishInternalDenied(request)
  if (denied) return denied

  const parsed = enquiryInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid enquiry', issues: parsed.error.issues.map(i => i.path.join('.')) }, { status: 400 })
  const input = parsed.data

  const limit = await checkSharedRateLimit(`publish-enquiry:${input.visitorIp ?? 'unknown'}`, 'contact')
  if (!limit.success) return NextResponse.json({ error: 'Too many enquiries — try again in a minute' }, { status: 429 })
  // A whole site's ceiling too: spread over many addresses, spam would still
  // make a lead and ring the bell for each one.
  const siteLimit = await checkSharedRateLimit(`publish-enquiry-site:${input.siteId}`, 'publishEnquirySite')
  if (!siteLimit.success) return NextResponse.json({ error: 'Too many enquiries — try again later' }, { status: 429 })

  try {
    const { enquiryId } = await recordWebEnquiry(createAdminClient() as never, input, { notify: notifyTeam })
    return NextResponse.json({ ok: true, enquiryId }, { status: 201 })
  } catch (e) {
    if (e instanceof EnquiryRejected) return NextResponse.json({ error: e.message }, { status: 404 })
    return publishInternalFailed('enquiry', e, 'the enquiry could not be saved')
  }
}
