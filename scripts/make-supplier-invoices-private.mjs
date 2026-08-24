#!/usr/bin/env node
// ============================================================================
// One-time: close the public supplier-invoices bucket.
//
//   node scripts/make-supplier-invoices-private.mjs           (dry run)
//   node scripts/make-supplier-invoices-private.mjs --apply
//
// The upload route created this bucket with `public: true` and stored
// `getPublicUrl()` on the row, so every uploaded supplier invoice — what an
// operator pays whom — was readable by anyone holding the URL, with no session
// and no tenant check. The code no longer does either, but the LIVE bucket is
// still public and the stale public URLs are still in the table: a code fix
// alone leaves the existing objects exposed.
//
// This does the two things code cannot do on its own:
//   1. flips the existing bucket to private;
//   2. clears `document_url` on rows whose document is one of OUR objects
//      (i.e. `document_storage_path` is set), because that column now holds a
//      dead public link. Rows whose `document_url` is an operator-supplied
//      EXTERNAL link are left alone — that link is not ours to remove.
//
// Reads are unaffected: the UI already goes through
// GET /api/supplier-invoices/[id]/document, which re-checks permission and
// signs a 60-second URL.
// ============================================================================

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const BUCKET = 'supplier-invoices'
const APPLY = process.argv.includes('--apply')

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
  console.log('    (The upload route now creates it private on first use.)')
} else if (bucket.public === false) {
  console.log(`  ✓ bucket "${BUCKET}" is already private.`)
} else {
  console.log(`  ✗ bucket "${BUCKET}" is PUBLIC — every uploaded invoice is world-readable.`)
  if (APPLY) {
    const { error } = await admin.storage.updateBucket(BUCKET, { public: false })
    if (error) {
      console.error('    failed to flip bucket:', error.message)
      process.exit(1)
    }
    console.log('    → flipped to private.')
  }
}

// ── 2. The stale public URLs ────────────────────────────────────────────────
const { data: rows, error: rowsErr } = await admin
  .from('supplier_invoices')
  .select('id, document_url, document_storage_path')
  .not('document_storage_path', 'is', null)
  .not('document_url', 'is', null)

if (rowsErr) {
  console.error('failed to read supplier_invoices:', rowsErr.message)
  process.exit(1)
}

if (!rows.length) {
  console.log('  ✓ no rows carry a stored public URL for our own objects.')
} else {
  console.log(`  ✗ ${rows.length} row(s) still store a public URL for an object we host.`)
  if (APPLY) {
    const { error } = await admin
      .from('supplier_invoices')
      .update({ document_url: null })
      .in('id', rows.map((r) => r.id))
    if (error) {
      console.error('    failed to clear document_url:', error.message)
      process.exit(1)
    }
    console.log('    → cleared (the document is still reachable via document_storage_path).')
  }
}

console.log(
  APPLY
    ? '\nDone. Open a supplier invoice with an attachment and confirm the document still opens.'
    : '\nDry run complete. Re-run with --apply to make these changes.'
)
