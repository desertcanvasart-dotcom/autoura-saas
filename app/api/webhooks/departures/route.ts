// ============================================
// API: DEPARTURE MIRROR WEBHOOK (Sawa -> Autoura)
// ============================================
// POST /api/webhooks/departures
// Receives signed `departure.sync` snapshots from the Sawa seat-pooling
// platform and upserts them into tour_departures for the mapped tenant.
//
// Auth:    HMAC-SHA256, X-Autoura-Signature: t=<unix>,v1=<hex> over
//          `${t}.${rawBody}` — same envelope as the concierge webhook,
//          but with its own secret pair: SAWA_SYNC_SECRET (current) and
//          SAWA_SYNC_SECRET_PREVIOUS (rotation overlap).
// Routing: payload `brand` -> concierge_brand_mappings (strict: unknown
//          or inactive brand is a 422 — mirrored data must never land in
//          a guessed tenant; there is deliberately NO fallback).
// Idempotency: (tenant_id, external_source='sawa', external_id) upsert.
// pending_review departures are Sawa-internal and are skipped.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  verifyConciergeSignature,
  signConciergePayload,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  REQUEST_ID_HEADER,
  DEFAULT_TOLERANCE_SECONDS,
} from '@/lib/concierge-webhook-auth'
import { validateDepartureSync, upsertMirroredDeparture, MIRROR_SOURCE } from '@/lib/departure-mirror'
import { normalizeBrandKey } from '@/lib/concierge-brief-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let _supabase: SupabaseClient<any, any, any, any, any> | null = null
function getSupabase(): SupabaseClient<any, any, any, any, any> {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

function syncSecrets(): Array<{ label: 'current' | 'previous'; secret: string }> {
  const out: Array<{ label: 'current' | 'previous'; secret: string }> = []
  if (process.env.SAWA_SYNC_SECRET) out.push({ label: 'current', secret: process.env.SAWA_SYNC_SECRET })
  if (process.env.SAWA_SYNC_SECRET_PREVIOUS) out.push({ label: 'previous', secret: process.env.SAWA_SYNC_SECRET_PREVIOUS })
  return out
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) || null
  const rawBody = await request.text()

  const secrets = syncSecrets()
  const verify = verifyConciergeSignature({
    rawBody,
    signatureHeader: request.headers.get(SIGNATURE_HEADER),
    timestampHeader: request.headers.get(TIMESTAMP_HEADER),
    secrets,
  })
  if (!verify.ok) {
    const status = verify.code === 'no_secret_configured' ? 500 : 401
    console.warn('[departure-mirror] signature rejected', { requestId, code: verify.code })
    return json({ success: false, error: verify.message, code: verify.code }, status)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return json({ success: false, error: 'Request body is not valid JSON.' }, 400)
  }

  const validation = validateDepartureSync(parsed)
  if (!validation.ok) {
    return json(
      { success: false, error: 'Payload failed validation.', field: validation.errors[0]?.field, errors: validation.errors },
      422
    )
  }

  // Strict brand -> tenant mapping. Mirrored rows must never land in a
  // guessed tenant, so there is no env/oldest-tenant fallback here.
  const brandKey = normalizeBrandKey(validation.payload.brand)
  const { data: mapping } = await getSupabase()
    .from('concierge_brand_mappings')
    .select('tenant_id, active')
    .eq('brand_key', brandKey)
    .maybeSingle()
  if (!mapping || !mapping.active) {
    console.warn('[departure-mirror] unmapped brand', { requestId, brand: brandKey })
    return json(
      { success: false, error: `No active tenant mapping for brand "${brandKey}".`, code: 'unknown_brand' },
      422
    )
  }

  try {
    const result = await upsertMirroredDeparture(getSupabase(), mapping.tenant_id as string, validation.payload)
    console.log('[departure-mirror] sync', {
      requestId,
      brand: brandKey,
      external_id: String(validation.payload.departure?.externalId),
      outcome: result.outcome,
    })
    return json({ success: true, data: { outcome: result.outcome, departure_id: result.departureId } }, 200)
  } catch (error: any) {
    console.error('[departure-mirror] upsert failed', { requestId, error: error?.message })
    return json({ success: false, error: 'Failed to store the departure. Safe to retry.' }, 500)
  }
}

// GET — health + signing contract + reproducible test vector, mirroring the
// concierge webhook's self-diagnostic.
export async function GET() {
  const TEST_SECRET = 'whsec_test_departures_autoura'
  const TEST_TIMESTAMP = 1735732800
  const TEST_BODY = '{"brand":"sawa-tours","departure":{"externalId":"1"}}'
  const expected = signConciergePayload(TEST_SECRET, TEST_TIMESTAMP, TEST_BODY)

  return json(
    {
      endpoint: 'Departure Mirror Webhook (Sawa -> Autoura)',
      status: 'active',
      method: 'POST',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/departures`,
      signature: {
        header: `${SIGNATURE_HEADER}: t=<unix>,v1=<hexdigest>`,
        companion_header: `${TIMESTAMP_HEADER}: <unix>`,
        signed_content: '`${t}.${rawBody}`',
        algorithm: 'HMAC-SHA256, lowercase hex',
        tolerance_seconds: DEFAULT_TOLERANCE_SECONDS,
        dual_secret: 'SAWA_SYNC_SECRET (current) and SAWA_SYNC_SECRET_PREVIOUS (rotation overlap) both accepted',
      },
      secrets_configured: syncSecrets().length,
      routing: 'payload `brand` -> concierge_brand_mappings (strict; no fallback)',
      idempotency: `(tenant_id, external_source='${MIRROR_SOURCE}', external_id) upsert; pending_review is skipped`,
      test_vector: {
        secret: TEST_SECRET,
        timestamp: TEST_TIMESTAMP,
        body: TEST_BODY,
        expected_signature_header: `t=${TEST_TIMESTAMP},v1=${expected}`,
      },
    },
    200
  )
}
