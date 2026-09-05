// ============================================
// /api/suppliers/[id]/contracts — the agreements held with a supplier
// ============================================
// GET  — list this supplier's documents (no storage paths; open/download go
//        through the sibling [contractId] route, which mints a signed URL)
// POST — multipart upload: file + title/document_type/property_id/dates/notes
//
// Tenant-scoped: reads and the index write ride the caller's RLS client, so a
// supplier the caller cannot see cannot receive a file. The service-role
// client only moves bytes into the PRIVATE bucket (migration 332) for a row
// RLS already accepted — the same split as supplier-invoices and
// traveller-documents.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { safeKeySegment } from '@/lib/storage-key'
import {
  SUPPLIER_CONTRACTS_BUCKET,
  MAX_CONTRACT_BYTES,
  CONTRACT_ALLOWED_TYPES,
  CONTRACT_REJECTION_MESSAGE,
  checkContractUpload,
  contractStorageKey,
  isContractDocumentType,
  parseContractDate,
  titleFromFilename,
} from '@/lib/supplier-contracts'

export const dynamic = 'force-dynamic'

export const CONTRACT_COLS =
  'id, tenant_id, supplier_id, property_id, document_type, title, valid_from, valid_to, notes, mime_type, size_bytes, original_filename, uploaded_by, created_at, updated_at, property:supplier_properties(id, name)'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase } = auth
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id } = await params
    const { data, error } = await supabase
      .from('supplier_contracts')
      .select(CONTRACT_COLS)
      .eq('supplier_id', id)
      .order('created_at', { ascending: false })
    if (error) {
      // 42P01 = table absent: migration 332 not applied yet. An empty tab,
      // not a broken one.
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [] })
      throw error
    }
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('GET supplier contracts error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, user } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id } = await params

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!form || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file selected.' }, { status: 400 })
    }
    // Refuse on the declared length BEFORE buffering the body.
    if (file.size > MAX_CONTRACT_BYTES) {
      return NextResponse.json({ success: false, error: CONTRACT_REJECTION_MESSAGE.too_large }, { status: 413 })
    }

    // --- metadata ---
    const documentType = String(form.get('document_type') ?? 'contract')
    if (!isContractDocumentType(documentType)) {
      return NextResponse.json({ success: false, error: 'Unknown document type' }, { status: 400 })
    }
    const title = String(form.get('title') ?? '').trim().slice(0, 200) || titleFromFilename(file.name)
    const from = parseContractDate(form.get('valid_from'))
    const to = parseContractDate(form.get('valid_to'))
    if (!from.ok || !to.ok) return NextResponse.json({ success: false, error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
    if (from.value && to.value && to.value < from.value) {
      return NextResponse.json({ success: false, error: 'Valid-to must not be before valid-from' }, { status: 400 })
    }
    const notes = String(form.get('notes') ?? '').trim().slice(0, 4000) || null
    const propertyIdRaw = String(form.get('property_id') ?? '').trim()

    // The supplier must exist IN THIS TENANT (RLS scopes the read).
    const { data: supplier } = await supabase.from('suppliers').select('id').eq('id', id).maybeSingle()
    if (!supplier) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })

    // A property, if named, must be one of THIS supplier's.
    let propertyId: string | null = null
    if (propertyIdRaw) {
      const { data: prop } = await supabase
        .from('supplier_properties')
        .select('id')
        .eq('id', propertyIdRaw)
        .eq('supplier_id', id)
        .maybeSingle()
      if (!prop) return NextResponse.json({ success: false, error: 'That property does not belong to this supplier' }, { status: 400 })
      propertyId = prop.id
    }

    // --- the bytes ---
    const bytes = new Uint8Array(await file.arrayBuffer())
    const verdict = checkContractUpload(bytes, file.type)
    if (!verdict.ok) {
      const status = verdict.reason === 'too_large' ? 413 : verdict.reason === 'type_not_allowed' ? 415 : 400
      return NextResponse.json({ success: false, error: CONTRACT_REJECTION_MESSAGE[verdict.reason] }, { status })
    }

    const storagePath = contractStorageKey({ tenantId: tenant_id, supplierId: id, unique: randomUUID(), ext: verdict.ext })
    const admin = createAdminClient()
    // Never upsert: the key carries a fresh UUID.
    let up = await admin.storage.from(SUPPLIER_CONTRACTS_BUCKET).upload(storagePath, bytes, { contentType: verdict.type, upsert: false })
    if (up.error && /bucket not found/i.test(up.error.message)) {
      // Migration 332 creates the bucket; this covers an install where storage
      // was provisioned after the migration ran. Private, always.
      await admin.storage.createBucket(SUPPLIER_CONTRACTS_BUCKET, {
        public: false,
        fileSizeLimit: MAX_CONTRACT_BYTES,
        allowedMimeTypes: CONTRACT_ALLOWED_TYPES,
      })
      up = await admin.storage.from(SUPPLIER_CONTRACTS_BUCKET).upload(storagePath, bytes, { contentType: verdict.type, upsert: false })
    }
    if (up.error) {
      console.error('supplier contract upload failed:', up.error.message)
      return NextResponse.json({ success: false, error: 'Upload failed — please try again shortly.' }, { status: 500 })
    }

    // The index row rides the caller's RLS client (tenant policy CHECK).
    const { data: row, error: insertError } = await supabase
      .from('supplier_contracts')
      .insert({
        tenant_id,
        supplier_id: id,
        property_id: propertyId,
        document_type: documentType,
        title,
        valid_from: from.value,
        valid_to: to.value,
        notes,
        storage_path: storagePath,
        mime_type: verdict.type,
        size_bytes: bytes.length,
        original_filename: safeKeySegment(file.name, 'document').slice(0, 255),
        uploaded_by: user?.id ?? null,
      })
      .select(CONTRACT_COLS)
      .single()
    if (insertError) {
      // The object exists but the index write failed — remove the orphan.
      await admin.storage.from(SUPPLIER_CONTRACTS_BUCKET).remove([storagePath])
      console.error('supplier contract index insert failed:', insertError.message)
      return NextResponse.json({ success: false, error: 'Upload failed — please try again shortly.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (error) {
    console.error('POST supplier contract error:', error)
    return NextResponse.json({ success: false, error: 'Upload failed — please try again shortly.' }, { status: 500 })
  }
}
