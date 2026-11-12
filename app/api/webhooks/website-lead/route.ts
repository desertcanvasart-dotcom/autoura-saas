// ============================================
// API: WEBSITE ENQUIRY WEBHOOK
// ============================================
// POST /api/webhooks/website-lead
// A company's OWN website (travel2egypt-next's /api/lead) sends each enquiry
// form here, so it becomes a lead in the app — not only an email to an inbox
// the app does not read (operator, 2026-11-12). Filed by
// lib/publish/external-enquiry.ts, once per the site's reference.
//
// Auth:    the concierge's HMAC (X-Autoura-Signature: t=<unix>,v1=<hex>,
//          lib/concierge-webhook-auth.ts) — the same site, the same secret.
// Routing: payload `brand` → concierge_brand_mappings (lib/concierge-brand-
//          routing); an unmapped brand is refused, never guessed. The
//          concierge add-on switch does NOT apply: this is the company's own
//          form, not the concierge.
// Dry-run: X-Autoura-Dry-Run: true (or ?dry_run=1) checks signature, payload
//          and routing without writing.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { notifyTeam, bellSnippet } from '@/lib/notifications'
import { verifyConciergeSignature, SIGNATURE_HEADER, TIMESTAMP_HEADER, REQUEST_ID_HEADER, DRY_RUN_HEADER } from '@/lib/concierge-webhook-auth'
import { resolveConciergeTenant } from '@/lib/concierge-brand-routing'
import { validateExternalEnquiry, recordExternalEnquiry } from '@/lib/publish/external-enquiry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Service-role client — webhooks have no user session. Lazy: build-safe.
let _supabase: SupabaseClient<any, any, any, any, any> | null = null
function getSupabase(): SupabaseClient<any, any, any, any, any> {
  if (!_supabase) _supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _supabase
}

const json = (body: unknown, status: number) => NextResponse.json(body, { status })

export async function POST(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) || null
  // The HMAC is over the raw bytes: read them before parsing.
  const rawBody = await request.text()

  const verify = verifyConciergeSignature({
    rawBody,
    signatureHeader: request.headers.get(SIGNATURE_HEADER),
    timestampHeader: request.headers.get(TIMESTAMP_HEADER),
  })
  if (!verify.ok) {
    console.warn('[website lead] signature rejected', { requestId, code: verify.code })
    return json({ success: false, error: verify.message, code: verify.code }, verify.code === 'no_secret_configured' ? 500 : 401)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return json({ success: false, error: 'Request body is not valid JSON.' }, 400)
  }
  const v = validateExternalEnquiry(parsed)
  if (!v.ok) return json({ success: false, error: v.error, field: v.field }, 422)

  const routing = await resolveConciergeTenant(getSupabase(), v.enquiry.brand)
  if (!routing.ok) {
    console.warn('[website lead] routing rejected', { requestId, code: routing.code, brand: v.enquiry.brand })
    return json({ success: false, error: routing.message, code: routing.code }, routing.code === 'no_tenant' ? 500 : 422)
  }

  const dryRun = request.headers.get(DRY_RUN_HEADER) === 'true' || new URL(request.url).searchParams.get('dry_run') === '1'
  if (dryRun) return json({ success: true, dry_run: true, data: { tenant_id: routing.tenantId, reference: v.enquiry.reference } }, 200)

  try {
    const result = await recordExternalEnquiry(getSupabase(), routing.tenantId, v.enquiry, {
      notify: input => notifyTeam({ ...input, message: bellSnippet(input.message) }),
    })
    console.log('[website lead]', result.status, { requestId, reference: v.enquiry.reference, tenant_id: routing.tenantId })
    return json({
      success: true,
      data: { status: result.status, enquiry_id: result.enquiryId, client_id: result.clientId, reference: v.enquiry.reference },
    }, 200)
  } catch (err) {
    console.error('[website lead] could not file the enquiry', { requestId, reference: v.enquiry.reference, error: (err as Error).message })
    return json({ success: false, error: 'The enquiry could not be saved. Retry.' }, 500)
  }
}
