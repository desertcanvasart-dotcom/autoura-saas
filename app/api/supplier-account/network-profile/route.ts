import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { SESSION_COOKIE } from '@/lib/supplier-accounts'
import { supplierFromToken } from '@/lib/supplier-session'
import { cleanProfile } from '@/lib/supplier-network'
import { sendMail } from '@/lib/email-send'
import { escapeHtml } from '@/lib/html-escape'

/**
 * The signed-in supplier's network profile (Phase 3, migration 453).
 * Session cookie (middleware self-auth prefix /api/supplier-account/).
 * GET  → their profile, its checking state and their papers' list.
 * POST { display_name, kinds, cities, languages, about, listed } → saved.
 *      Changing the name or kinds of a verified profile sends it back for checking.
 * POST { submit: true } → sent to the Autoura team for checking (needs a paper).
 */
async function signedIn(request: NextRequest, db: SupabaseClient) {
  return supplierFromToken(db, request.cookies.get(SESSION_COOKIE)?.value)
}

export async function GET(request: NextRequest) {
  const db = createAdminClient() as unknown as SupabaseClient
  const me = await signedIn(request, db)
  if (!me) return NextResponse.json({ success: false, error: 'Please sign in again' }, { status: 401 })
  const [{ data: profile }, { data: papers }] = await Promise.all([
    db.from('supplier_network_profiles').select('display_name, kinds, cities, languages, about, listed, verification_status, verification_note, verified_at')
      .eq('account_id', me.account.id).maybeSingle(),
    db.from('supplier_network_documents').select('id, kind, title, mime_type, size_bytes, uploaded_at')
      .eq('account_id', me.account.id).order('uploaded_at', { ascending: false }),
  ])
  return NextResponse.json({ success: true, data: { profile: profile ?? null, papers: papers ?? [], default_name: me.account.display_name } })
}

export async function POST(request: NextRequest) {
  const db = createAdminClient() as unknown as SupabaseClient
  const me = await signedIn(request, db)
  if (!me) return NextResponse.json({ success: false, error: 'Please sign in again' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { data: current } = await db.from('supplier_network_profiles')
    .select('display_name, kinds, verification_status').eq('account_id', me.account.id).maybeSingle()

  if (body.submit === true) {
    if (!current) return NextResponse.json({ success: false, error: 'Save your profile first' }, { status: 409 })
    if (current.verification_status === 'verified') return NextResponse.json({ success: false, error: 'Already verified' }, { status: 409 })
    const { count } = await db.from('supplier_network_documents').select('id', { count: 'exact', head: true }).eq('account_id', me.account.id)
    if (!count) return NextResponse.json({ success: false, error: 'Upload at least one paper (licence or vehicle papers) first' }, { status: 409 })
    const { error } = await db.from('supplier_network_profiles')
      .update({ verification_status: 'pending', verification_note: null, updated_at: new Date().toISOString() }).eq('account_id', me.account.id)
    if (error) return NextResponse.json({ success: false, error: 'Could not send — please try again' }, { status: 500 })
    await tellAutouraTeam(current.display_name as string)
    return NextResponse.json({ success: true, status: 'pending' })
  }

  const parsed = cleanProfile(body)
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
  const p = parsed.value
  // A verified supplier who changes who they are (name or kinds) is checked again.
  const recheck = current?.verification_status === 'verified'
    && (current.display_name !== p.display_name || JSON.stringify([...(current.kinds as string[])].sort()) !== JSON.stringify([...p.kinds].sort()))
  const row = {
    account_id: me.account.id, display_name: p.display_name, kinds: p.kinds, cities: p.cities, languages: p.languages,
    about: p.about, listed: p.listed, updated_at: new Date().toISOString(),
    ...(recheck ? { verification_status: 'pending', verified_at: null, verified_by: null } : {}),
  }
  const { error } = await db.from('supplier_network_profiles').upsert(row, { onConflict: 'account_id' })
  if (error) return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  if (recheck) await tellAutouraTeam(p.display_name)
  return NextResponse.json({ success: true, rechecking: recheck })
}

/** The Autoura team's checking queue gets a new entry: an email to the super admins. */
async function tellAutouraTeam(name: string) {
  const to = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
  for (const addr of to) {
    const sent = await sendMail({
      to: addr,
      subject: `A supplier asks to be verified: ${name}`,
      html: `<p><b>${escapeHtml(name)}</b> sent their network profile and papers for checking.</p><p>Open Super admin → Network suppliers to review.</p>`,
    })
    if (!sent.success) console.error('[network] verify-request email failed:', sent.error)
  }
}
