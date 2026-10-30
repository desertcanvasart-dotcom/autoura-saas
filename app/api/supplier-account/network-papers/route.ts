import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { SESSION_COOKIE } from '@/lib/supplier-accounts'
import { supplierFromToken } from '@/lib/supplier-session'
import { MAX_PAPERS, MAX_PAPER_BYTES, NETWORK_PAPERS_BUCKET, PAPER_KINDS, checkPaperUpload, paperKey } from '@/lib/supplier-network-papers'

/**
 * The signed-in supplier's papers for network checking (Phase 3, 453).
 * Session cookie. POST multipart { file, kind, title? } → stored in the
 * private bucket under their account; DELETE { id } → removed (their own only).
 * They can never read a paper back through here — only the Autoura team can.
 */
export async function POST(request: NextRequest) {
  const db = createAdminClient() as unknown as SupabaseClient
  const me = await supplierFromToken(db, request.cookies.get(SESSION_COOKIE)?.value)
  if (!me) return NextResponse.json({ success: false, error: 'Please sign in again' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!form || !(file instanceof File)) return NextResponse.json({ success: false, error: 'No file selected.' }, { status: 400 })
  if (file.size > MAX_PAPER_BYTES) return NextResponse.json({ success: false, error: 'The file is too large (10 MB maximum).' }, { status: 413 })
  const kind = String(form.get('kind') ?? 'other')
  if (!(kind in PAPER_KINDS)) return NextResponse.json({ success: false, error: 'Choose what this paper is' }, { status: 400 })
  const { count } = await db.from('supplier_network_documents').select('id', { count: 'exact', head: true }).eq('account_id', me.account.id)
  if ((count ?? 0) >= MAX_PAPERS) return NextResponse.json({ success: false, error: `At most ${MAX_PAPERS} papers — remove one first` }, { status: 409 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const verdict = checkPaperUpload(bytes, file.type)
  if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 415 })

  const key = paperKey(me.account.id, randomUUID(), verdict.ext)
  const up = await db.storage.from(NETWORK_PAPERS_BUCKET).upload(key, bytes, { contentType: verdict.type, upsert: false })
  if (up.error) return NextResponse.json({ success: false, error: 'Could not upload — please try again' }, { status: 500 })
  const title = String(form.get('title') ?? '').trim().slice(0, 200) || PAPER_KINDS[kind]
  const { data, error } = await db.from('supplier_network_documents').insert({
    account_id: me.account.id, kind, title, storage_path: key, mime_type: verdict.type, size_bytes: bytes.length,
  }).select('id, kind, title, mime_type, size_bytes, uploaded_at').single()
  if (error) {
    await db.storage.from(NETWORK_PAPERS_BUCKET).remove([key])
    return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}

export async function DELETE(request: NextRequest) {
  const db = createAdminClient() as unknown as SupabaseClient
  const me = await supplierFromToken(db, request.cookies.get(SESSION_COOKIE)?.value)
  if (!me) return NextResponse.json({ success: false, error: 'Please sign in again' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { data: doc } = await db.from('supplier_network_documents').select('id, storage_path')
    .eq('id', String(body.id ?? '')).eq('account_id', me.account.id).maybeSingle()
  if (!doc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  const { error } = await db.from('supplier_network_documents').delete().eq('id', doc.id).eq('account_id', me.account.id)
  if (error) return NextResponse.json({ success: false, error: 'Could not remove — please try again' }, { status: 500 })
  const rm = await db.storage.from(NETWORK_PAPERS_BUCKET).remove([doc.storage_path as string])
  if (rm.error) console.error('[network papers] storage remove:', rm.error.message)
  return NextResponse.json({ success: true })
}
