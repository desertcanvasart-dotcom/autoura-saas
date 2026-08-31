#!/usr/bin/env node
// Seed (or reuse) the tenant the portal E2E journey writes into.
//
// The journey WRITES -- bookings, passengers, documents, chat messages -- so
// the one thing this script must guarantee is that it can only ever write
// somewhere disposable. It does that by making the fixture tenant identify
// itself: settings.e2e_fixture === true. The spec refuses to run against a
// tenant without that marker, so pointing E2E at a live project cannot
// quietly seed a real agency's data.
//
// That guard is not theoretical. During manual testing on 2026-08-30 a
// harness that fell back to "the first tenant" seeded into Sawa Tours and
// the chat's notify path emailed their real contact address three times.
// Hence also E2E_CONTACT_EMAIL below: the fixture's contact address is an
// RFC-2606 .invalid domain, so the notify fallback has nowhere real to send.
//
// Usage:
//   E2E_SUPABASE_URL=... E2E_SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-e2e-tenant.mjs
//
// Idempotent: prints the tenant id on every run, creating it only once.

import { createClient } from '@supabase/supabase-js'

const URL = process.env.E2E_SUPABASE_URL
const KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
export const E2E_TENANT_NAME = 'E2E Fixture Agency'
export const E2E_CONTACT_EMAIL = 'e2e-sink@example.invalid'
export const DOCS_BUCKET = 'traveller-documents'

if (!URL || !KEY) {
  console.error('E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const db = createClient(URL, KEY, { auth: { persistSession: false } })

// Refuse to seed a project that already looks like somebody's real install.
// A throwaway E2E project has the fixture tenant and little else; a live one
// has other agencies in it. This is a cheap, honest floor -- it cannot prove
// a project is disposable, but it does stop the most likely accident.
const { data: tenants, error: listErr } = await db
  .from('tenants')
  .select('id, company_name, settings')
if (listErr) {
  console.error('Could not read tenants:', listErr.message)
  process.exit(1)
}

const fixture = tenants?.find((t) => t.settings?.e2e_fixture === true)
const others = (tenants ?? []).filter((t) => t.settings?.e2e_fixture !== true)

if (!fixture && others.length > 0 && !process.env.E2E_ALLOW_SHARED_PROJECT) {
  console.error(
    `Refusing to seed: this project already has ${others.length} non-fixture tenant(s) ` +
      `(${others.map((t) => t.company_name).join(', ')}).\n` +
      'Point E2E_SUPABASE_URL at a dedicated throwaway project (docs/E2E.md), or set ' +
      'E2E_ALLOW_SHARED_PROJECT=1 if you accept seeding alongside them.'
  )
  process.exit(1)
}

let tenantId = fixture?.id
if (!tenantId) {
  const { data, error } = await db
    .from('tenants')
    .insert({
      company_name: E2E_TENANT_NAME,
      contact_email: E2E_CONTACT_EMAIL,
      currency: 'EUR',
      settings: { e2e_fixture: true },
    })
    .select('id')
    .single()
  if (error) {
    console.error('Could not create the fixture tenant:', error.message)
    process.exit(1)
  }
  tenantId = data.id
  console.error(`Created fixture tenant ${tenantId}`)
} else {
  // Keep the marker and the sink address true even if someone edited them.
  await db
    .from('tenants')
    .update({ contact_email: E2E_CONTACT_EMAIL, settings: { ...fixture.settings, e2e_fixture: true } })
    .eq('id', tenantId)
  console.error(`Reusing fixture tenant ${tenantId}`)
}

// The traveller-documents bucket must exist and must be PRIVATE -- the
// journey asserts an uploaded passport is not publicly downloadable, and a
// public bucket would turn that assertion into a false pass.
const { data: buckets } = await db.storage.listBuckets()
const existing = buckets?.find((b) => b.name === DOCS_BUCKET)
if (!existing) {
  const { error } = await db.storage.createBucket(DOCS_BUCKET, { public: false })
  if (error) console.error(`Warning: could not create ${DOCS_BUCKET}: ${error.message}`)
  else console.error(`Created private bucket ${DOCS_BUCKET}`)
} else if (existing.public) {
  await db.storage.updateBucket(DOCS_BUCKET, { public: false })
  console.error(`Bucket ${DOCS_BUCKET} was public — set to private`)
}

// stdout is the tenant id alone, so CI can capture it.
console.log(tenantId)
