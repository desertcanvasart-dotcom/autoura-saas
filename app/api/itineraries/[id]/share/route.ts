import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { generateShareToken } from '@/lib/itinerary-share'
import { appRedirectBase } from '@/lib/oauth-config'

/**
 * Create / read / revoke the share link for an itinerary.
 *
 * A share link IS a send path — it puts a price in front of a traveller, same
 * as email and WhatsApp — so it runs the same output gate (harness Layer 2):
 * an unpriced draft or a non-deliverable amount refuses to share.
 *
 * One active link per itinerary, enforced by a partial unique index. POST is
 * idempotent: sharing again returns the existing link, so an operator can
 * always re-copy it, and revoking kills the only URL that exists.
 */

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const { supabase, tenant_id, user } = auth

  const { data: itinerary, error } = await supabase!
    .from('itineraries')
    .select('id, status, total_cost, currency, tenant_id')
    .eq('id', id)
    .eq('tenant_id', tenant_id!)
    .maybeSingle()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!itinerary) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

  // The gate. A draft has no real price (that is what draft MEANS since the
  // rate-holes work), and a broken amount must not reach a traveller.
  if (itinerary.status === 'draft') {
    return NextResponse.json(
      { success: false, error: 'This itinerary is not priced yet, so it cannot be shared with a client.' },
      { status: 422 }
    )
  }
  const priceCheck = checkAmountDeliverable(itinerary.total_cost, { currency: itinerary.currency })
  if (!priceCheck.ok) {
    return NextResponse.json(
      { success: false, error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
      { status: 422 }
    )
  }

  // Existing active link wins — one URL per itinerary.
  const { data: existing } = await supabase!
    .from('itinerary_shares')
    .select('token')
    .eq('itinerary_id', id)
    .is('revoked_at', null)
    .maybeSingle()

  let token = existing?.token
  if (!token) {
    token = generateShareToken()
    const { error: insErr } = await supabase!.from('itinerary_shares').insert({
      tenant_id,
      itinerary_id: id,
      token,
      created_by: user!.id,
    })
    if (insErr) {
      // 23505 = someone shared concurrently; return theirs rather than
      // erroring. ANY OTHER failure (RLS denial, FK violation, connection
      // loss) means no row exists — and `token` still holds the string we
      // just generated, so an early version fell through to success:true and
      // handed the operator a URL that 404s. Clear it first, so only a token
      // that came back from the database can be returned.
      token = undefined

      if (insErr.code === '23505') {
        const { data: raced } = await supabase!
          .from('itinerary_shares')
          .select('token')
          .eq('itinerary_id', id)
          .is('revoked_at', null)
          .maybeSingle()
        token = raced?.token
      }

      if (!token) {
        return NextResponse.json({ success: false, error: insErr.message }, { status: 500 })
      }
    }
  }

  // Absolute URL off the configured app origin — request.url is the container
  // address on Railway (the OAuth-callback lesson).
  const base = appRedirectBase(process.env.NEXT_PUBLIC_APP_URL, request.url)
  return NextResponse.json({
    success: true,
    token,
    url: new URL(`/share/${token}`, base).toString(),
  })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  // Revoke, never delete: the row stays as the record of what was shared.
  const { error } = await auth.supabase!
    .from('itinerary_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('itinerary_id', id)
    .eq('tenant_id', auth.tenant_id!)
    .is('revoked_at', null)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
