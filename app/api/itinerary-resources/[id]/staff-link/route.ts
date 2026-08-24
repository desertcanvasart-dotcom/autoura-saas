import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { generateStaffToken } from '@/lib/staff-link'
import { appRedirectBase } from '@/lib/oauth-config'

/**
 * Create / read / revoke the tap-link for one assignment.
 *
 * Mirrors the itinerary share route: POST is idempotent (one active link per
 * assignment, enforced by uq_staff_links_active), so the office can always
 * re-copy the same URL, and DELETE revokes the only URL that exists.
 */

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const { supabase, tenant_id, user } = auth

  const { data: resource, error } = await supabase!
    .from('itinerary_resources')
    .select('id, itinerary_id, status')
    .eq('id', id)
    .eq('tenant_id', tenant_id!)
    .maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!resource) return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 })
  if (resource.status === 'cancelled') {
    return NextResponse.json({ success: false, error: 'This assignment is cancelled' }, { status: 422 })
  }

  const { data: existing } = await supabase!
    .from('staff_links')
    .select('token')
    .eq('itinerary_resource_id', id)
    .is('revoked_at', null)
    .maybeSingle()

  let token = existing?.token
  if (!token) {
    token = generateStaffToken()
    const { error: insErr } = await supabase!.from('staff_links').insert({
      tenant_id,
      itinerary_id: resource.itinerary_id,
      itinerary_resource_id: id,
      token,
      created_by: user!.id,
    })
    if (insErr) {
      // Only a token that came back from the database may be returned — the
      // share route's lesson: a generated-but-unsaved token is a URL that 404s.
      token = undefined
      if (insErr.code === '23505') {
        const { data: raced } = await supabase!
          .from('staff_links')
          .select('token')
          .eq('itinerary_resource_id', id)
          .is('revoked_at', null)
          .maybeSingle()
        token = raced?.token
      }
      if (!token) {
        return NextResponse.json({ success: false, error: insErr.message }, { status: 500 })
      }
    }
  }

  const base = appRedirectBase(process.env.NEXT_PUBLIC_APP_URL, request.url)
  return NextResponse.json({
    success: true,
    token,
    url: new URL(`/staff/${token}`, base).toString(),
  })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const { error } = await auth.supabase!
    .from('staff_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('itinerary_resource_id', id)
    .eq('tenant_id', auth.tenant_id!)
    .is('revoked_at', null)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
