#!/usr/bin/env node
// ============================================================================
// One-time: close the public whatsapp-media bucket and backfill paths.
//
//   node scripts/make-whatsapp-media-private.mjs           (dry run)
//   node scripts/make-whatsapp-media-private.mjs --apply
//
// The webhook created this bucket with `public: true` and stored
// `getPublicUrl()` in `whatsapp_messages.media_url`, so every file a customer
// sent into a WhatsApp thread — passport pages, payment receipts — was
// readable by anyone holding the URL, with no session and no tenant check.
// Objects sit in one flat `inbound/` namespace shared by all tenants.
//
// Run this AFTER applying migration 293 (media_storage_path) and deploying the
// code that writes it. Order matters: the backfill below writes that column.
//
// Three steps, all idempotent:
//   1. flip the bucket to private;
//   2. backfill `media_storage_path` from the public URL already stored, so
//      existing attachments keep opening through the signed-URL route;
//   3. clear `media_url` on those rows — it is now a dead public link.
//
// URLs we do NOT own are left completely alone: Twilio serves its own inbound
// media, and lib/whatsapp-ai-agent stores an outbound quote PDF URL in the
// same column. Only URLs pointing into THIS bucket are touched.
// ============================================================================

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const BUCKET = 'whatsapp-media'
const APPLY = process.argv.includes('--apply')
// The public-URL shape Supabase mints: …/object/public/<bucket>/<path>
const PUBLIC_MARKER = `/object/public/${BUCKET}/`

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey)

console.log(APPLY ? 'APPLYING changes\n' : 'DRY RUN — nothing will be changed. Re-run with --apply\n')

// ── 1. The bucket ───────────────────────────────────────────────────────────
const { data: bucket, error: getErr } = await admin.storage.getBucket(BUCKET)

if (getErr || !bucket) {
  console.log(`  · bucket "${BUCKET}" does not exist yet — nothing to close.`)
  console.log('    (The webhook now creates it private on first inbound media.)')
} else if (bucket.public === false) {
  console.log(`  ✓ bucket "${BUCKET}" is already private.`)
} else {
  console.log(`  ✗ bucket "${BUCKET}" is PUBLIC — every customer file in it is world-readable.`)
  if (APPLY) {
    const { error } = await admin.storage.updateBucket(BUCKET, { public: false })
    if (error) {
      console.error('    failed to flip bucket:', error.message)
      process.exit(1)
    }
    console.log('    → flipped to private.')
  }
}

// ── 2 & 3. Backfill paths, then drop the dead public URLs ───────────────────
const { data: rows, error: rowsErr } = await admin
  .from('whatsapp_messages')
  .select('id, media_url, media_storage_path')
  .not('media_url', 'is', null)

if (rowsErr) {
  console.error('failed to read whatsapp_messages:', rowsErr.message)
  if (/media_storage_path/.test(rowsErr.message)) {
    console.error('→ apply supabase/migrations/293_whatsapp_media_storage_path.sql first.')
  }
  process.exit(1)
}

const ours = rows.filter((r) => String(r.media_url).includes(PUBLIC_MARKER))
const foreign = rows.length - ours.length
const needBackfill = ours.filter((r) => !r.media_storage_path)

console.log(
  `\n  ${rows.length} message(s) carry a media_url — ${ours.length} point into "${BUCKET}", ` +
    `${foreign} are hosted elsewhere (left untouched).`
)

if (!ours.length) {
  console.log('  ✓ nothing to migrate.')
} else {
  console.log(`  ${needBackfill.length} need a storage path backfilled.`)

  if (APPLY) {
    let backfilled = 0
    let cleared = 0

    for (const row of ours) {
      const path =
        row.media_storage_path ||
        decodeURIComponent(String(row.media_url).split(PUBLIC_MARKER)[1] || '')

      if (!path) {
        console.error(`    · ${row.id}: could not derive a path — left as is.`)
        continue
      }

      const { error } = await admin
        .from('whatsapp_messages')
        .update({ media_storage_path: path, media_url: null })
        .eq('id', row.id)

      if (error) {
        console.error(`    · ${row.id}: update failed — ${error.message}`)
        continue
      }
      if (!row.media_storage_path) backfilled++
      cleared++
    }

    console.log(`    → ${backfilled} path(s) backfilled, ${cleared} dead public URL(s) cleared.`)
  }
}

console.log(
  APPLY
    ? '\nDone. Open a WhatsApp conversation with an attachment and confirm it still opens.'
    : '\nDry run complete. Re-run with --apply to make these changes.'
)
