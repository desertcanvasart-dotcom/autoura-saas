// POST /api/onboarding/vocabulary — the "Your words" step has no data of its
// own (every edit already went through /api/vocabulary and the destination
// manager); this only records that the step was passed, so a returning
// operator resumes after it.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as { current_step?: number }
    const { error } = await supabase
      .from('tenant_features')
      .update({ onboarding_step: Math.max(2, Number(body.current_step) || 2), updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id)
    if (error) console.error('onboarding vocabulary step:', error)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('onboarding vocabulary POST:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
