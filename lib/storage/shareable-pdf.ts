// ============================================
// A PDF sent by WhatsApp: stored privately, shared by a signed link
// ============================================
// The contract, invoice and supplier-document senders uploaded to a
// `documents` bucket that does not exist on production — "Failed to upload
// PDF: Bucket not found" (live 2026-09-24). And every sender, the quote one
// included, then asked for a PUBLIC url: on a private bucket that link
// cannot be opened (so the WhatsApp provider could not fetch the file), and
// on a public one it would expose clients' names, trips and prices to
// anyone holding the link, forever.
//
// Now: one private bucket, a tenant-first path, and a signed link that lives
// long enough for WhatsApp to fetch it (and the client to open it that week).

import type { SupabaseClient } from '@supabase/supabase-js'

/** Private bucket for documents sent to clients and suppliers (migration 387). */
export const SENT_DOCUMENTS_BUCKET = 'sent-documents'

/** 7 days: the provider fetches at send time; the client may open it later. */
export const SENT_DOCUMENT_LINK_SECONDS = 7 * 24 * 60 * 60

export type ShareablePdf = { ok: true; url: string; path: string } | { ok: false; error: string }

/** Upload to `bucket` at `tenantId/<kind>/<name>` and return a signed link. */
export async function uploadShareablePdf(
  admin: SupabaseClient,
  opts: {
    tenantId: string
    kind: 'contracts' | 'invoices' | 'supplier-documents' | 'quotes'
    fileName: string
    bytes: Uint8Array | Buffer
    bucket?: string
  },
): Promise<ShareablePdf> {
  const bucket = opts.bucket ?? SENT_DOCUMENTS_BUCKET
  const safeName = opts.fileName.replace(/[^\w.-]+/g, '-')
  const path = `${opts.tenantId}/${opts.kind}/${safeName}`

  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(path, opts.bytes, { contentType: 'application/pdf', upsert: true })
  if (uploadError) return { ok: false, error: `Failed to upload PDF: ${uploadError.message}` }

  const { data, error: signError } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SENT_DOCUMENT_LINK_SECONDS)
  if (signError || !data?.signedUrl) {
    return { ok: false, error: `Failed to create a link to the PDF: ${signError?.message ?? 'no url'}` }
  }
  return { ok: true, url: data.signedUrl, path }
}
