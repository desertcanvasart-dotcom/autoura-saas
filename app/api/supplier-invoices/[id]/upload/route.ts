// POST /api/supplier-invoices/[id]/upload — attach the source document.
import { gateRole } from '@/lib/api-role-gate'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'

const BUCKET = 'supplier-invoices'
const MAX = 20 * 1024 * 1024

// Lazy service-role client: constructing at module scope crashes `next build`
// ("Collecting page data" evaluates every route module) when env vars aren't
// present at build time — this exact line broke the Railway deploy on
// 2026-07-14. Matches lib/supabase-server's build-safe convention.
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id } = auth
    const { id } = await params

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    if (file.size > MAX) return NextResponse.json({ success: false, error: 'File too large (max 20MB)' }, { status: 400 })
    // A document, not any file: PDF or an image.
    if (!/^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(file.type)) {
      return NextResponse.json({ success: false, error: 'Upload a PDF or an image (PNG, JPG, WebP, GIF)' }, { status: 400 })
    }

    // The invoice first, as the caller sees it (RLS): the file was written
    // with the service key before this check, leaving an orphan behind a bad id.
    const { data: existing } = await supabase
      .from('supplier_invoices').select('id, document_storage_path').eq('id', id).maybeSingle()
    if (!existing) return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${tenant_id}/${id}/${Date.now()}-${safeName}`

    let up = await admin().storage.from(BUCKET).upload(filePath, buffer, { contentType: file.type, upsert: true })
    if (up.error?.message?.includes('Bucket not found')) {
      // PRIVATE. A public bucket serves supplier invoices — what an operator
      // pays whom — to anyone holding the URL, with no session and no tenant
      // check. Reads go through GET /api/supplier-invoices/[id]/document,
      // which re-checks permission and signs a 60-second URL.
      await admin().storage.createBucket(BUCKET, { public: false })
      up = await admin().storage.from(BUCKET).upload(filePath, buffer, { contentType: file.type, upsert: true })
    }
    if (up.error) {
      console.error('upload error:', up.error.message)
      return NextResponse.json({ success: false, error: 'Failed to upload document' }, { status: 500 })
    }

    // Only the PATH is persisted. `document_url` stays reserved for the
    // externally-hosted link a caller may supply at create time; a stored
    // public URL for our own object is the exposure this route removed.
    const { data, error } = await supabase
      .from('supplier_invoices')
      .update({
        document_filename: file.name,
        document_storage_path: filePath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).select().single()
    if (error) {
      await admin().storage.from(BUCKET).remove([filePath])
      return NextResponse.json({ success: false, error: 'Failed to attach the document to the invoice' }, { status: 500 })
    }
    // The document it replaces is removed (each upload left the last behind).
    const previous = (existing as { document_storage_path?: string | null }).document_storage_path
    if (previous && previous !== filePath) await admin().storage.from(BUCKET).remove([previous])

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('upload route error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
