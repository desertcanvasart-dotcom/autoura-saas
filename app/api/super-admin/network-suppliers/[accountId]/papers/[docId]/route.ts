import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSuperAdmin } from '@/lib/super-admin'
import { NETWORK_PAPERS_BUCKET } from '@/lib/supplier-network-papers'

// One paper, for the Autoura team: a signed link valid for one minute. The
// paper must belong to the account named in the path, and its key must sit
// under that account — never any other object in the bucket.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ accountId: string; docId: string }> }) {
  const auth = await requireSuperAdmin()
  if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const db = auth.adminClient as unknown as SupabaseClient
  const { accountId, docId } = await params
  const { data: doc } = await db.from('supplier_network_documents').select('storage_path')
    .eq('id', docId).eq('account_id', accountId).maybeSingle()
  const path = doc?.storage_path as string | undefined
  if (!path || !path.startsWith(`${accountId}/`)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  const { data, error } = await db.storage.from(NETWORK_PAPERS_BUCKET).createSignedUrl(path, 60)
  if (error || !data?.signedUrl) return NextResponse.json({ success: false, error: 'Could not open the paper' }, { status: 500 })
  return NextResponse.json({ success: true, url: data.signedUrl })
}
