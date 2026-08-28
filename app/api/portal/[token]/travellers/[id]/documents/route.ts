// ============================================
// GET / POST /api/portal/[token]/travellers/[id]/documents  (C1b)
// ============================================
// The traveller attaching their passport page — the only route in this app
// that accepts a FILE from someone with no session. Two independent guards:
// the portal gate (isValidPortalToken + cookie + portalLinkState + passenger
// scoping, via resolvePortalPassenger) decides WHO may write, and
// lib/portal/traveller-documents.ts decides WHAT may be stored.
//
// The bucket is PRIVATE. Nothing here builds a public URL and the response
// never contains one — a row id is exchanged for a short-lived signed URL by
// the sibling [docId] route, behind the same gate.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase-server'
import { portalVerifyCookieName, resolvePortalPassenger } from '@/lib/booking-portal'
import {
  TRAVELLER_DOCS_BUCKET,
  MAX_DOCUMENT_BYTES,
  checkUpload,
  documentStorageKey,
  purgeAfterFor,
  REJECTION_MESSAGE,
  type DocumentKind,
} from '@/lib/portal/traveller-documents'
import { safeKeySegment } from '@/lib/storage-key'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** What the traveller may know about their own uploads — never the storage
 *  path: a key is not for them, and printing it invites trying it. */
const publicShape = (row: Record<string, unknown>) => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  filename: row.original_filename,
  sizeBytes: row.size_bytes,
  uploadedAt: row.uploaded_at,
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params
    const db = createAdminClient()
    // Listing stays available on a locked form: the traveller should still
    // see what they sent, they just cannot change it.
    const gate = await resolvePortalPassenger(db, {
      token,
      passengerId: id,
      cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
    })
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

    const { data } = await db
      .from('booking_passenger_documents')
      .select('id, kind, label, original_filename, size_bytes, uploaded_at')
      .eq('passenger_id', id)
      .is('purged_at', null)
      .order('uploaded_at', { ascending: true })
    return NextResponse.json({
      success: true,
      documents: (data ?? []).map(publicShape),
      locked: gate.link.form_locked,
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params
    if (!checkRateLimit(`portal-doc:${getClientIdentifier(request)}`, 'api').success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }
    const db = createAdminClient()
    const gate = await resolvePortalPassenger(db, {
      token,
      passengerId: id,
      cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
      requireUnlocked: true,
    })
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!form || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file selected.' }, { status: 400 })
    }
    const kind: DocumentKind = form.get('kind') === 'passport' ? 'passport' : 'other'
    const rawLabel = String(form.get('label') ?? '').trim().slice(0, 120)

    // Refuse on the declared length BEFORE buffering a 2 GB body.
    if (file.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ success: false, error: REJECTION_MESSAGE.too_large }, { status: 413 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { count: otherCount } = await db
      .from('booking_passenger_documents')
      .select('id', { count: 'exact', head: true })
      .eq('passenger_id', id)
      .eq('kind', 'other')
      .is('purged_at', null)

    const verdict = checkUpload(bytes, file.type, { kind, existingOtherCount: otherCount ?? 0 })
    if (!verdict.ok) {
      const status = verdict.reason === 'too_large' ? 413 : verdict.reason === 'too_many' ? 409 : 415
      return NextResponse.json({ success: false, error: REJECTION_MESSAGE[verdict.reason] }, { status })
    }

    const storagePath = documentStorageKey({
      bookingId: gate.link.booking_id,
      passengerId: id,
      kind,
      ext: verdict.ext,
      unique: randomUUID(),
    })

    const { error: uploadError } = await db.storage
      .from(TRAVELLER_DOCS_BUCKET)
      // Never upsert: the key carries a fresh UUID, and silently replacing a
      // file is the wrong behaviour when the file is somebody's passport.
      .upload(storagePath, bytes, { contentType: verdict.type, upsert: false })
    if (uploadError) {
      console.error('[portal] traveller document upload failed:', uploadError.message)
      return NextResponse.json({ success: false, error: 'Upload failed — please try again shortly.' }, { status: 500 })
    }

    // Passport = one replaceable slot. Retire the previous row and object
    // AFTER the new one is safely stored, so a failed upload never leaves
    // the traveller with nothing.
    if (kind === 'passport') {
      const { data: prior } = await db
        .from('booking_passenger_documents')
        .select('id, storage_path')
        .eq('passenger_id', id)
        .eq('kind', 'passport')
        .is('purged_at', null)
        .maybeSingle()
      if (prior) {
        // If retiring the old slot fails, the one-live-passport index would
        // reject the new row anyway — surface it now and remove the fresh
        // object rather than half-replacing somebody's passport.
        const { error: priorObjErr } = await db.storage.from(TRAVELLER_DOCS_BUCKET).remove([prior.storage_path])
        const { error: priorRowErr } = priorObjErr
          ? { error: priorObjErr }
          : await db.from('booking_passenger_documents').delete().eq('id', prior.id)
        if (priorRowErr) {
          console.error('[portal] passport slot replacement failed:', priorRowErr.message)
          await db.storage.from(TRAVELLER_DOCS_BUCKET).remove([storagePath])
          return NextResponse.json({ success: false, error: 'Upload failed — please try again shortly.' }, { status: 500 })
        }
      }
    }

    const uploadedAt = new Date()
    const { data: bookingRow } = await db
      .from('bookings')
      .select('end_date')
      .eq('id', gate.link.booking_id)
      .maybeSingle()

    const { data: row, error: insertError } = await db
      .from('booking_passenger_documents')
      .insert({
        tenant_id: gate.link.tenant_id,
        booking_id: gate.link.booking_id,
        passenger_id: id,
        kind,
        label: kind === 'other' ? (rawLabel || null) : null,
        storage_path: storagePath,
        mime_type: verdict.type,
        size_bytes: bytes.length,
        original_filename: safeKeySegment(file.name, 'document').slice(0, 255),
        uploaded_at: uploadedAt.toISOString(),
        uploaded_via: 'portal',
        purge_after: purgeAfterFor(bookingRow?.end_date ?? null, uploadedAt),
      })
      .select('id, kind, label, original_filename, size_bytes, uploaded_at')
      .single()
    if (insertError) {
      // The object exists but the index write failed — remove the orphan.
      await db.storage.from(TRAVELLER_DOCS_BUCKET).remove([storagePath])
      return NextResponse.json({ success: false, error: 'Upload failed — please try again shortly.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, document: publicShape(row) })
  } catch (err) {
    console.error('[portal documents POST]', err)
    return NextResponse.json({ success: false, error: 'Upload failed — please try again shortly.' }, { status: 500 })
  }
}
