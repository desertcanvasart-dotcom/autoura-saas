import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import {
  isValidFromLocal,
  isValidSendingDomain,
  previewSenderAddress,
  resolveSender,
} from '@/lib/tenant-email-domain'

/**
 * Per-tenant sending domain.
 *
 * Lets an operator send invoices and itineraries from their own domain instead
 * of the platform's. Three steps, matching how domain verification actually
 * works: claim the domain (POST), publish the DNS records we hand back, then
 * ask us to re-check (PUT).
 *
 * Nothing here changes the From address on its own — lib/tenant-email-domain.ts
 * uses a tenant address ONLY while status is 'verified'. Until DNS is live,
 * mail keeps going out from the platform sender rather than failing.
 */

const SENDER_COLS = 'company_name, contact_email, email_domain, email_from_local, email_domain_status, email_domain_verified_at, resend_domain_id'

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}

/** Only owners/admins change how the company's mail is sent. */
function canManage(role: string | null | undefined): boolean {
  return ['owner', 'admin'].includes(role || '')
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const { data: tenant, error } = await auth.supabase!
    .from('tenants')
    .select(SENDER_COLS)
    .eq('id', auth.tenant_id!)
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const sender = resolveSender(tenant, process.env.RESEND_FROM_EMAIL || '')

  return NextResponse.json({
    success: true,
    domain: tenant.email_domain,
    from_local: tenant.email_from_local,
    status: tenant.email_domain_status,
    verified_at: tenant.email_domain_verified_at,
    /** What clients see today — the platform sender until verification lands. */
    sending_as: sender.from,
    using_own_domain: sender.usingTenantDomain,
    /** What they will send as once verified. */
    will_send_as: previewSenderAddress(tenant),
  })
}

/** Claim a domain and return the DNS records the operator must publish. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  if (!canManage(auth.role)) {
    return NextResponse.json(
      { success: false, error: 'Only owners and admins can change the sending domain' },
      { status: 403 }
    )
  }

  const client = resend()
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'RESEND_API_KEY is not configured' },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const domain = String(body.domain ?? '').trim().toLowerCase()
  const fromLocal = String(body.from_local ?? 'invoices').trim().toLowerCase()

  // Rejected here rather than at Resend: a pasted URL or full address is the
  // common mistake, and it would sit "pending" forever without an explanation.
  if (!isValidSendingDomain(domain)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Enter a bare domain, e.g. sawatours.org — no https://, no @, no path.',
      },
      { status: 400 }
    )
  }

  // Checked here, not quietly replaced at send time: an invalid local part
  // ("Bookings Team") was saved and shown as the sender, while mail actually
  // went out from invoices@ (safeLocal in lib/tenant-email-domain.ts).
  if (fromLocal && !isValidFromLocal(fromLocal)) {
    return NextResponse.json(
      {
        success: false,
        error: 'The sender name before the @ may use only letters, digits, dots, hyphens and underscores, e.g. bookings.',
      },
      { status: 400 }
    )
  }

  try {
    const { data, error } = await client.domains.create({ name: domain })
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || 'Resend rejected the domain' },
        { status: 400 }
      )
    }

    // Service role: migration 420 lets only it write the sending-domain
    // columns, so an admin cannot mark a domain verified straight through
    // PostgREST. canManage() above is the authorisation.
    const { error: saveError } = await createAdminClient()
      .from('tenants')
      .update({
        email_domain: domain,
        email_from_local: fromLocal || 'invoices',
        resend_domain_id: data?.id ?? null,
        // Pending, never verified: DNS has to propagate first, and claiming
        // otherwise would switch the From address to a domain that bounces.
        email_domain_status: 'pending',
        email_domain_verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.tenant_id!)

    if (saveError) {
      return NextResponse.json({ success: false, error: saveError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      domain,
      status: 'pending',
      will_send_as: `${fromLocal || 'invoices'}@${domain}`,
      /** Publish these, then call PUT to re-check. */
      dns_records: data?.records ?? [],
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/** Re-check verification with Resend after the DNS records are published. */
export async function PUT() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  if (!canManage(auth.role)) {
    return NextResponse.json(
      { success: false, error: 'Only owners and admins can change the sending domain' },
      { status: 403 }
    )
  }

  const client = resend()
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'RESEND_API_KEY is not configured' },
      { status: 503 }
    )
  }

  const { data: tenant } = await auth.supabase!
    .from('tenants')
    .select('resend_domain_id, email_domain, email_from_local')
    .eq('id', auth.tenant_id!)
    .single()

  if (!tenant?.resend_domain_id) {
    return NextResponse.json(
      { success: false, error: 'No domain has been claimed yet' },
      { status: 400 }
    )
  }

  try {
    // Ask Resend to re-read DNS, then read back the authoritative status
    // rather than trusting the trigger call's response.
    await client.domains.verify(tenant.resend_domain_id)
    const { data, error } = await client.domains.get(tenant.resend_domain_id)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || 'Could not read the domain status' },
        { status: 502 }
      )
    }

    const verified = data?.status === 'verified'
    const status = verified ? 'verified' : data?.status === 'failed' ? 'failed' : 'pending'

    // Service role, as in POST (migration 420).
    const { error: saveError } = await createAdminClient()
      .from('tenants')
      .update({
        email_domain_status: status,
        email_domain_verified_at: verified ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.tenant_id!)
    // Reporting "Verified" when the status was never saved would leave the
    // From address on the platform sender while the screen says otherwise.
    if (saveError) {
      return NextResponse.json({ success: false, error: saveError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      status,
      verified,
      dns_records: data?.records ?? [],
      sending_as: verified
        ? `${tenant.email_from_local || 'invoices'}@${tenant.email_domain}`
        : process.env.RESEND_FROM_EMAIL,
      message: verified
        ? 'Verified — mail now sends from your domain.'
        : 'Not verified yet. DNS can take up to 72 hours; mail keeps sending from the platform address until then.',
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Release the company's sending domain: remove it from Resend and clear it
 * here. Without this a domain, once claimed, was held for good — by the
 * unique index even while only `pending` — so a wrong or mistyped domain could
 * never be replaced, and a domain claimed by the wrong company could never be
 * onboarded by its real owner. Mail goes back to the platform sender.
 */
export async function DELETE() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  if (!canManage(auth.role)) {
    return NextResponse.json(
      { success: false, error: 'Only owners and admins can change the sending domain' },
      { status: 403 }
    )
  }

  const admin = createAdminClient()
  const { data: tenant, error: readError } = await admin
    .from('tenants')
    .select('resend_domain_id, email_domain')
    .eq('id', auth.tenant_id!)
    .single()
  if (readError) {
    return NextResponse.json({ success: false, error: readError.message }, { status: 500 })
  }
  if (!tenant?.email_domain && !tenant?.resend_domain_id) {
    return NextResponse.json({ success: true, status: 'not_configured' })
  }

  if (tenant.resend_domain_id) {
    const client = resend()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'RESEND_API_KEY is not configured' },
        { status: 503 }
      )
    }
    const { error } = await client.domains.remove(tenant.resend_domain_id)
    // Already gone at Resend is fine — the point is to release it here.
    if (error && !/not.?found/i.test(`${error.name ?? ''} ${error.message ?? ''}`)) {
      return NextResponse.json(
        { success: false, error: error.message || 'Resend would not remove the domain' },
        { status: 502 }
      )
    }
  }

  // Service role, as in POST and PUT (migration 420).
  const { error: saveError } = await admin
    .from('tenants')
    .update({
      email_domain: null,
      email_from_local: 'invoices',
      resend_domain_id: null,
      email_domain_status: 'not_configured',
      email_domain_verified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', auth.tenant_id!)
  if (saveError) {
    return NextResponse.json({ success: false, error: saveError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, status: 'not_configured', sending_as: process.env.RESEND_FROM_EMAIL })
}
