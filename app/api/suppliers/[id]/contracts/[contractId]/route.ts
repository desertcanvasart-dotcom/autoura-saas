// ============================================
// /api/suppliers/[id]/contracts/[contractId] — one supplier document
// ============================================
// GET    — open the file: 302 to a 60-second signed URL (?download=1 forces
//          a download under the original filename)
// PATCH  — edit the metadata (title, type, property, dates, notes)
// DELETE — remove the file and its index row
//
// Every action first fetches the row with the CALLER'S RLS-bound client, so a
// caller who cannot see the document cannot open, edit or delete it. The
// service-role client only signs or removes a path that check already
// authorised — see app/api/supplier-invoices/[id]/document/route.ts for why
// the bucket is private and reads go through a route.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import {
  SUPPLIER_CONTRACTS_BUCKET,
  isContractDocumentType,
  parseContractDate,
} from '@/lib/supplier-contracts'

export const dynamic = 'force-dynamic'

const COLS =
  'id, tenant_id, supplier_id, property_id, document_type, title, valid_from, valid_to, notes, mime_type, size_bytes, original_filename, uploaded_by, created_at, updated_at, property:supplier_properties(id, name)'

// Long enough to open a PDF, short enough that a leaked URL is worthless by
// the time it is pasted anywhere.
const SIGNED_URL_TTL_SECONDS = 60

type Params = { params: Promise<{ id: string; contractId: string }> }

async function loadRow(supabase: NonNullable<Awaited<ReturnType<typeof requireAuth>>['supabase']>, supplierId: string, contractId: string) {
  const { data } = await supabase
    .from('supplier_contracts')
    .select('id, tenant_id, storage_path, original_filename')
    .eq('id', contractId)
    .eq('supplier_id', supplierId)
    .maybeSingle()
  return data
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id, contractId } = await params
    const row = await loadRow(supabase, id, contractId)
    if (!row) return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })

    // Defence in depth: uploads write `<tenant_id>/...`, so a path pointing
    // outside the caller's tenant means the column was tampered with.
    if (!String(row.storage_path).startsWith(`${tenant_id}/`)) {
      console.error('supplier contract: path outside caller tenant', { contractId })
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }

    const wantsDownload = request.nextUrl.searchParams.get('download') === '1'
    const { data: signed, error } = await createAdminClient()
      .storage.from(SUPPLIER_CONTRACTS_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, wantsDownload ? { download: row.original_filename || true } : undefined)
    if (error || !signed?.signedUrl) {
      console.error('supplier contract sign error:', error?.message)
      return NextResponse.json({ success: false, error: 'Failed to open document' }, { status: 500 })
    }
    // Redirect rather than returning the URL: the browser follows it straight
    // to the file and the signed URL never has to live in page state.
    return NextResponse.redirect(signed.signedUrl)
  } catch (error) {
    console.error('GET supplier contract error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase } = auth
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id, contractId } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if ('title' in body) {
      const title = String(body.title ?? '').trim().slice(0, 200)
      if (!title) return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 })
      patch.title = title
    }
    if ('document_type' in body) {
      if (!isContractDocumentType(body.document_type)) return NextResponse.json({ success: false, error: 'Unknown document type' }, { status: 400 })
      patch.document_type = body.document_type
    }
    if ('notes' in body) patch.notes = String(body.notes ?? '').trim().slice(0, 4000) || null
    if ('valid_from' in body) {
      const d = parseContractDate(body.valid_from)
      if (!d.ok) return NextResponse.json({ success: false, error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
      patch.valid_from = d.value
    }
    if ('valid_to' in body) {
      const d = parseContractDate(body.valid_to)
      if (!d.ok) return NextResponse.json({ success: false, error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
      patch.valid_to = d.value
    }
    if ('property_id' in body) {
      const pid = String(body.property_id ?? '').trim()
      if (pid) {
        const { data: prop } = await supabase.from('supplier_properties').select('id').eq('id', pid).eq('supplier_id', id).maybeSingle()
        if (!prop) return NextResponse.json({ success: false, error: 'That property does not belong to this supplier' }, { status: 400 })
      }
      patch.property_id = pid || null
    }

    const { data, error } = await supabase
      .from('supplier_contracts')
      .update(patch)
      .eq('id', contractId)
      .eq('supplier_id', id)
      .select(COLS)
      .maybeSingle()
    if (error) {
      // 23514 = the valid_from/valid_to range constraint.
      if (error.code === '23514') return NextResponse.json({ success: false, error: 'Valid-to must not be before valid-from' }, { status: 400 })
      throw error
    }
    if (!data) return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PATCH supplier contract error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase } = auth
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id, contractId } = await params
    const row = await loadRow(supabase, id, contractId)
    if (!row) return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })

    // Object first, then row: a failure here leaves the row pointing at a
    // file that still exists, which is recoverable; the reverse is not.
    const { error: removeError } = await createAdminClient().storage.from(SUPPLIER_CONTRACTS_BUCKET).remove([row.storage_path])
    if (removeError && !/not found/i.test(removeError.message)) {
      console.error('supplier contract object remove failed:', removeError.message)
      return NextResponse.json({ success: false, error: 'Could not delete the file' }, { status: 500 })
    }
    const { error } = await supabase.from('supplier_contracts').delete().eq('id', contractId).eq('supplier_id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE supplier contract error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
