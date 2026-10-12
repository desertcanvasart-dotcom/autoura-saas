import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'

// POST /api/onboarding/team — record that the wizard's Team step is done.
//
// It used to create the invitations itself, through the admin client, with no
// role check: any signed-in user (a manager, at any time) could create an
// ADMIN invitation for an address they controlled and accept it. It also sent
// no email (a TODO, with links to a page that does not exist) while the wizard
// said "Invitations sent", and skipped the seat limit and the duplicate and
// role-rank checks. The wizard now invites through POST /api/invitations —
// the one route that has all of those and sends the email — and calls this
// only to move the wizard on.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const denied = roleDenied(authResult.role, 'admin')
    if (denied) return denied

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as { current_step?: number }
    // The step to resume on (the wizard sends the one after Team).
    const sent = Number(body.current_step)
    const next = Number.isFinite(sent) && sent > 0 ? Math.floor(sent) : 5
    const { error } = await supabase
      .from('tenant_features')
      .update({ onboarding_step: next, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in onboarding team POST:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
