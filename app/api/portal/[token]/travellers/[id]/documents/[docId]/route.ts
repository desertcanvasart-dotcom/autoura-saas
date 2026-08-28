// GET /api/portal/[token]/travellers/[id]/documents/[docId] — exchange a row
// id for a SHORT-LIVED signed URL so the traveller can view their own upload.
// DELETE removes a supporting document (the passport slot is replaced by
// re-upload, and a locked form deletes nothing).
//
// Same gate as the upload route: isValidPortalToken + verified cookie +
// portalLinkState + passenger scoping via resolvePortalPassenger.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { portalVerifyCookieName, resolvePortalPassenger } from '@/lib/booking-portal'
import { TRAVELLER_DOCS_BUCKET } from '@/lib/portal/traveller-documents'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const NOT_FOUND = () => NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

async function ownedDocument(
  db: ReturnType<typeof createAdminClient>,
  opts: { docId: string; passengerId: string; bookingId: string }
) {
  const { data } = await db
    .from('booking_passenger_documents')
    .select('id, kind, storage_path, purged_at')
    .eq('id', opts.docId)
    .eq('passenger_id', opts.passengerId)
    .eq('booking_id', opts.bookingId)
    .maybeSingle()
  return data && !data.purged_at ? data : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string; docId: string }> }
) {
  try {
    const { token, id, docId } = await params
    if (!checkRateLimit(`portal-doc-view:${getClientIdentifier(request)}`, 'api').success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }
    const db = createAdminClient()
    const gate = await resolvePortalPassenger(db, {
      token,
      passengerId: id,
      cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
    })
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

    const doc = await ownedDocument(db, { docId, passengerId: id, bookingId: gate.link.booking_id })
    if (!doc) return NOT_FOUND()

    const { data: signed, error } = await db.storage
      .from(TRAVELLER_DOCS_BUCKET)
      .createSignedUrl(doc.storage_path, 60) // one minute: view it, not share it
    if (error || !signed?.signedUrl) return NOT_FOUND()
    return NextResponse.json({ success: true, url: signed.signedUrl })
  } catch {
    return NOT_FOUND()
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string; docId: string }> }
) {
  try {
    const { token, id, docId } = await params
    const db = createAdminClient()
    const gate = await resolvePortalPassenger(db, {
      token,
      passengerId: id,
      cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
      requireUnlocked: true,
    })
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

    const doc = await ownedDocument(db, { docId, passengerId: id, bookingId: gate.link.booking_id })
    if (!doc) return NOT_FOUND()

    const { error: removeError } = await db.storage.from(TRAVELLER_DOCS_BUCKET).remove([doc.storage_path])
    if (removeError) {
      console.error('[portal] document object removal failed:', removeError.message)
      return NextResponse.json({ success: false, error: 'Could not delete — please try again.' }, { status: 500 })
    }
    const { error: rowError } = await db.from('booking_passenger_documents').delete().eq('id', doc.id)
    if (rowError) {
      console.error('[portal] document row delete failed:', rowError.message)
      return NextResponse.json({ success: false, error: 'Could not delete — please try again.' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NOT_FOUND()
  }
}
