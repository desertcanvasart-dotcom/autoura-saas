// ============================================
// /api/account/company — close the company (owner), or change your mind
// ============================================
// GET    the closure, if one is scheduled (any member: the banner reads it)
// POST   { confirm_name } — schedule deletion CLOSURE_GRACE_DAYS from now and
//        stop the subscription renewing. Owners only; the company name typed
//        back is the confirmation.
// DELETE cancel the scheduled deletion and resume renewal. Owners only.
//
// The deletion itself is the daily cron (app/api/cron/purge-closed-companies),
// and what it deletes is lib/account/company-closure.ts.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { purgeDateFrom, setRenewal } from '@/lib/account/company-closure'

export const dynamic = 'force-dynamic'

const ownersOnly = () =>
  NextResponse.json({ success: false, error: 'Only an owner can close the company.' }, { status: 403 })

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { data, error } = await createAdminClient()
    .from('tenant_closures')
    .select('requested_at, purge_after')
    .eq('tenant_id', auth.tenant_id)
    .maybeSingle()
  if (error) return NextResponse.json({ success: false, error: 'Could not read the company status' }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  if (auth.role !== 'owner') return ownersOnly()

  const body = await request.json().catch(() => ({}))
  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants').select('company_name').eq('id', auth.tenant_id).maybeSingle()
  if (!tenant) return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 })
  const typed = typeof body?.confirm_name === 'string' ? body.confirm_name.trim() : ''
  if (typed.toLowerCase() !== tenant.company_name.trim().toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Type the company name exactly to confirm.' }, { status: 400 })
  }

  const purgeAfter = purgeDateFrom(new Date()).toISOString()
  // ignoreDuplicates: a second request keeps the first date — asking twice
  // must not move the deletion later (or earlier).
  const { error } = await admin
    .from('tenant_closures')
    .upsert(
      { tenant_id: auth.tenant_id, requested_by: auth.user.id, purge_after: purgeAfter },
      { onConflict: 'tenant_id', ignoreDuplicates: true },
    )
  if (error) return NextResponse.json({ success: false, error: 'Could not schedule the closure' }, { status: 500 })

  const billingProblem = await setRenewal(admin, auth.tenant_id, false)
  if (billingProblem) console.error('[account/company] stopping renewal failed:', billingProblem)

  const { data } = await admin
    .from('tenant_closures')
    .select('requested_at, purge_after')
    .eq('tenant_id', auth.tenant_id)
    .maybeSingle()
  return NextResponse.json({ success: true, data, billing_warning: billingProblem ? 'Renewal could not be stopped automatically; cancel it under Billing.' : null })
}

export async function DELETE() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  if (auth.role !== 'owner') return ownersOnly()

  const admin = createAdminClient()
  const { error } = await admin.from('tenant_closures').delete().eq('tenant_id', auth.tenant_id)
  if (error) return NextResponse.json({ success: false, error: 'Could not cancel the closure' }, { status: 500 })

  const billingProblem = await setRenewal(admin, auth.tenant_id, true)
  if (billingProblem) console.error('[account/company] resuming renewal failed:', billingProblem)
  return NextResponse.json({ success: true, billing_warning: billingProblem ? 'Renewal could not be resumed automatically; check Billing.' : null })
}
