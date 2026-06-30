// ============================================
// API: CONCIERGE BRIEF WEBHOOK
// ============================================
// POST /api/webhooks/concierge
// Receives structured planning briefs from the Travel2Egypt AI Concierge.
//
// Auth:        HMAC-SHA256, X-Autoura-Signature: t=<unix>,v1=<hex>  (see lib/concierge-webhook-auth.ts)
// Idempotency: UNIQUE(conversation_id, brief_revision)             (see lib/concierge-brief-intake.ts)
// Schema/map:  lib/concierge-brief-schema.ts
//
// Tenant: briefs are written tenant-scoped. The tenant is resolved from
//         CONCIERGE_WEBHOOK_TENANT_ID, falling back to the first tenant
//         (single-tenant deployments). (owner decision: default-tenant-via-env)
//
// Dry-run: send header `X-Autoura-Dry-Run: true` (or ?dry_run=1) to verify
//          signature + validate + preview the mapping WITHOUT writing.
//
// NOTE (v1): durable rate limiting is intentionally NOT applied here. For one
// trusted, HMAC-authenticated concierge source we rely on platform protection.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  verifyConciergeSignature,
  getConfiguredSecrets,
  signConciergePayload,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  REQUEST_ID_HEADER,
  DRY_RUN_HEADER,
  DEFAULT_TOLERANCE_SECONDS,
} from '@/lib/concierge-webhook-auth'
import { validateBrief, mapBrief } from '@/lib/concierge-brief-schema'
import { ingestBrief, type IngestOutcome } from '@/lib/concierge-brief-intake'
import { promoteBriefToThread } from '@/lib/concierge/promote-brief-to-thread'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Service-role client — webhooks have no user session (bypasses RLS).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status })
}

const STATUS_LABEL: Record<IngestOutcome, string> = {
  received: 'received',
  updated: 'updated',
  duplicate_ignored: 'duplicate_ignored',
  older_revision_filed: 'older_revision_filed',
}

/**
 * Resolve the tenant inbound briefs belong to. Prefers the explicit env var;
 * otherwise uses the first tenant (works cleanly for single-tenant installs).
 * Returns null if no tenant can be determined.
 */
async function resolveTenantId(): Promise<string | null> {
  const configured = process.env.CONCIERGE_WEBHOOK_TENANT_ID
  if (configured) return configured
  const { data } = await supabase.from('tenants').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
  return (data?.id as string) ?? null
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) || null

  // 1. Raw body — MUST be read before JSON parsing; HMAC is over raw bytes.
  const rawBody = await request.text()

  // 2. Signature verification (HMAC-SHA256, dual-secret, replay window).
  const verify = verifyConciergeSignature({
    rawBody,
    signatureHeader: request.headers.get(SIGNATURE_HEADER),
    timestampHeader: request.headers.get(TIMESTAMP_HEADER),
  })
  if (!verify.ok) {
    // Server misconfig (no secret) is our fault -> 500; everything else -> 401.
    const status = verify.code === 'no_secret_configured' ? 500 : 401
    console.warn('[concierge] signature rejected', { requestId, code: verify.code })
    return json({ success: false, error: verify.message, code: verify.code }, status)
  }

  // 3. Parse JSON.
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return json({ success: false, error: 'Request body is not valid JSON.' }, 400)
  }

  // 4. Validate.
  const validation = validateBrief(parsed)
  if (!validation.ok) {
    return json(
      { success: false, error: 'Payload failed validation.', field: validation.errors[0]?.field, errors: validation.errors },
      422
    )
  }

  const mapped = mapBrief(validation.payload)

  console.log('[concierge] brief received', {
    requestId,
    conversation_id: validation.payload.conversation_id,
    session_id: validation.payload.session_id,
    brief_revision: mapped.briefRevision,
    secret_used: verify.secretUsed,
    actionable: mapped.isActionable,
  })

  // 5. Dry-run: stop here, no DB writes.
  const dryRun =
    request.headers.get(DRY_RUN_HEADER) === 'true' ||
    new URL(request.url).searchParams.get('dry_run') === '1'

  if (dryRun) {
    const { full_transcript, ...briefColumns } = mapped.briefRow as Record<string, unknown>
    return json(
      {
        success: true,
        dry_run: true,
        signature: { valid: true, secret_used: verify.secretUsed },
        validation: { ok: true },
        would: {
          action: validation.payload.is_update ? 'update_or_file_revision' : 'create_or_replace_current',
          brief_revision: mapped.briefRevision,
          review_status: 'needs_review',
        },
        mapping_preview: {
          client: mapped.client,
          preferences: mapped.preferences,
          note_present: !!mapped.note,
          flags: mapped.flags,
          is_actionable: mapped.isActionable,
          transcript_messages: Array.isArray(full_transcript) ? full_transcript.length : 0,
          brief_columns: briefColumns,
        },
      },
      200
    )
  }

  // 6. Resolve tenant, then ingest (idempotent upsert + revision history).
  const tenantId = await resolveTenantId()
  if (!tenantId) {
    console.error('[concierge] no tenant resolved (set CONCIERGE_WEBHOOK_TENANT_ID)', { requestId })
    return json({ success: false, error: 'No tenant configured to receive briefs.' }, 500)
  }

  try {
    const result = await ingestBrief(mapped, { requestId, rawPayload: validation.payload }, supabase, tenantId)

    // Promote the brief into a Copilot thread so operators see it in the inbox
    // alongside WhatsApp/email. Only on a new or updated brief (not a duplicate
    // replay / older revision). NON-FATAL: a promotion failure must never fail
    // the webhook — the brief is already durably stored.
    let threadId: string | null = null
    if (result.outcome === 'received' || result.outcome === 'updated') {
      try {
        const promotion = await promoteBriefToThread(result.briefId, tenantId, supabase)
        threadId = promotion.threadId
      } catch (promoteErr: any) {
        console.warn('[concierge] promote-to-thread failed (non-fatal)', {
          requestId,
          brief_id: result.briefId,
          error: promoteErr?.message,
        })
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    return json(
      {
        success: true,
        data: {
          brief_id: result.briefId,
          conversation_id: result.conversationId,
          brief_revision: result.briefRevision,
          status: STATUS_LABEL[result.outcome],
          review_status: result.reviewStatus,
          client_id: result.clientId,
          thread_id: threadId,
          record_url: result.clientId && appUrl ? `${appUrl}/clients/${result.clientId}` : null,
        },
      },
      result.httpStatus
    )
  } catch (error: any) {
    console.error('[concierge] ingestion failed', { requestId, error: error?.message })
    return json({ success: false, error: 'Autoura failed to store the brief. Safe to retry.' }, 500)
  }
}

// ============================================
// GET — health + canonicalization recipe + reproducible test vector
// ============================================
// The test vector lets the concierge confirm its signer produces the same
// digest as Autoura, using a FIXED published test secret (not the real one).
export async function GET(request: NextRequest) {
  const TEST_SECRET = 'whsec_test_concierge_autoura'
  const TEST_TIMESTAMP = 1735732800 // 2025-01-01T12:00:00Z (fixed)
  const TEST_BODY = '{"conversation_id":"test-conversation","brief_revision":1}'
  const expected = signConciergePayload(TEST_SECRET, TEST_TIMESTAMP, TEST_BODY)

  return json(
    {
      endpoint: 'Concierge Brief Webhook',
      status: 'active',
      method: 'POST',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/concierge`,
      signature: {
        header: `${SIGNATURE_HEADER}: t=<unix>,v1=<hexdigest>`,
        companion_header: `${TIMESTAMP_HEADER}: <unix>`,
        request_id_header: REQUEST_ID_HEADER,
        signed_content: '`${t}.${rawBody}`',
        algorithm: 'HMAC-SHA256, lowercase hex',
        tolerance_seconds: DEFAULT_TOLERANCE_SECONDS,
        dual_secret: 'CONCIERGE_WEBHOOK_SECRET (current) and CONCIERGE_WEBHOOK_SECRET_PREVIOUS (rotation overlap) both accepted',
      },
      // Count only — never leaks secret values. 0 means env is not configured.
      secrets_configured: getConfiguredSecrets().length,
      test_vector: {
        secret: TEST_SECRET,
        timestamp: TEST_TIMESTAMP,
        body: TEST_BODY,
        expected_signature_header: `t=${TEST_TIMESTAMP},v1=${expected}`,
      },
      dry_run: `Send ${DRY_RUN_HEADER}: true (or ?dry_run=1) to verify signing + preview mapping without writing.`,
    },
    200
  )
}
