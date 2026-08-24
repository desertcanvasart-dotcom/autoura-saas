// GET /api/supplier-invoices/[id]/document — short-lived signed URL for the
// uploaded source document.
//
// ============================================================================
// WHY THIS ROUTE EXISTS
// ============================================================================
// The upload route created its bucket with `public: true` and stored
// `getPublicUrl()` on the row. A Supabase public bucket serves every object to
// anyone who has the URL — no session, no tenant check — and that URL was
// handed to the browser, so it survives in history, referrers, logs, and any
// forwarded screenshot. Supplier invoices carry what an operator pays whom,
// which is exactly the commercial information a competitor would want.
//
// The path (`<tenant_id>/<invoice_id>/<timestamp>-<name>`) is not a secret
// either: tenant and invoice ids appear in the app's own URLs.
//
// So the bucket is private and the document is reached through this route,
// which re-derives permission on every view: the invoice row is fetched with
// the CALLER'S RLS-BOUND client, so a caller who cannot see the invoice cannot
// mint a URL for its document. The service-role client is used only to sign a
// path that check already authorised — the same split as lib/sender-tenant.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'

const BUCKET = 'supplier-invoices'

// Long enough to open a PDF, short enough that a leaked URL is worthless by
// the time it is pasted anywhere.
const SIGNED_URL_TTL_SECONDS = 60

// Lazy service-role client: constructing at module scope crashes `next build`
// ("Collecting page data" evaluates every route module) when env vars aren't
// present at build time. Matches lib/supabase-server's build-safe convention.
let _admin: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _admin
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id } = auth
    const { id } = await params

    // THE permission check. RLS-bound client: a row the caller may not read
    // comes back empty, and this 404s before anything is signed.
    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      .select('document_storage_path')
      .eq('id', id)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
    }

    const storagePath = invoice.document_storage_path
    if (!storagePath) {
      return NextResponse.json({ success: false, error: 'No document attached' }, { status: 404 })
    }

    // Defence in depth: uploads write `<tenant_id>/...`, so a path pointing
    // outside the caller's tenant means the column was tampered with. Refuse
    // rather than sign it.
    if (!String(storagePath).startsWith(`${tenant_id}/`)) {
      console.error('supplier-invoice document: path outside caller tenant', { id })
      return NextResponse.json({ success: false, error: 'No document attached' }, { status: 404 })
    }

    const { data: signed, error: signError } = await admin()
      .storage.from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

    if (signError || !signed?.signedUrl) {
      console.error('supplier-invoice document sign error:', signError?.message)
      return NextResponse.json({ success: false, error: 'Failed to open document' }, { status: 500 })
    }

    // Redirect rather than returning the URL: the browser follows it straight
    // to the file and the signed URL never has to live in page state.
    return NextResponse.redirect(signed.signedUrl)
  } catch (e: any) {
    console.error('supplier-invoice document route error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
