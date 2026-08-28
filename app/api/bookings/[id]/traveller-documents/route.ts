// GET /api/bookings/[id]/traveller-documents — the OFFICE side of traveller
// uploads (C1b): list every document on the booking with short-lived signed
// URLs. Staff-authenticated and RLS-scoped; the private bucket never serves
// anyone a permanent URL.

import { NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { TRAVELLER_DOCS_BUCKET } from '@/lib/portal/traveller-documents'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    const { id } = await params

    // RLS-scoped: rows come back only for the caller's own tenant. The
    // storage_path stays server-side — the response carries signed URLs.
    const { data: docs, error } = await supabase
      .from('booking_passenger_documents')
      .select('id, passenger_id, kind, label, original_filename, mime_type, size_bytes, uploaded_at, uploaded_via, purge_after, purged_at, storage_path')
      .eq('booking_id', id)
      .order('uploaded_at', { ascending: true })
    if (error) {
      // Table absent = migration 301 not applied yet.
      return NextResponse.json({ success: true, documents: [] })
    }

    const admin = createAdminClient()
    const documents = await Promise.all(
      (docs ?? []).map(async doc => {
        const { storage_path, ...safe } = doc
        if (doc.purged_at) return { ...safe, url: null }
        // 10 minutes: enough to review, not a durable link.
        const { data: signed } = await admin.storage
          .from(TRAVELLER_DOCS_BUCKET)
          .createSignedUrl(storage_path, 600)
        return { ...safe, url: signed?.signedUrl ?? null }
      })
    )
    return NextResponse.json({ success: true, documents })
  } catch (err) {
    console.error('traveller-documents error:', err)
    return NextResponse.json({ success: false, error: 'Failed to load documents' }, { status: 500 })
  }
}
