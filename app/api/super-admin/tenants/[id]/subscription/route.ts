import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params
    const body = await request.json()

    const allowedFields = ['plan_id', 'status', 'billing_cycle', 'trial_ends_at', 'current_period_end', 'canceled_at']
    const updates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 })
    }

    // Check if subscription exists
    const { data: existing } = await admin.from('tenant_subscriptions').select('id').eq('tenant_id', id).maybeSingle()

    if (existing) {
      const { error } = await admin.from('tenant_subscriptions').update(updates).eq('tenant_id', id)
      if (error) throw error
    } else {
      // Create subscription
      const { error } = await admin.from('tenant_subscriptions').insert({
        tenant_id: id,
        ...updates,
        status: updates.status || 'active',
      })
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
