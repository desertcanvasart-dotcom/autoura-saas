import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * Save / remove this browser's push subscription. Session-gated (the ops
 * board is office-only); the endpoint's UNIQUE constraint makes re-subscribing
 * from the same browser an upsert, not a duplicate.
 */

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const body = await request.json()
    const endpoint = body?.subscription?.endpoint
    const p256dh = body?.subscription?.keys?.p256dh
    const authKey = body?.subscription?.keys?.auth
    if (
      typeof endpoint !== 'string' || !endpoint.startsWith('https://') ||
      typeof p256dh !== 'string' || !p256dh ||
      typeof authKey !== 'string' || !authKey
    ) {
      return NextResponse.json({ success: false, error: 'Invalid subscription' }, { status: 400 })
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { tenant_id, user_id: user!.id, endpoint, p256dh, auth: authKey },
        { onConflict: 'endpoint' }
      )
    if (error) {
      console.error('[push subscribe]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to save subscription' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push subscribe]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase, tenant_id } = auth
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const body = await request.json()
    const endpoint = body?.endpoint
    if (typeof endpoint !== 'string' || !endpoint) {
      return NextResponse.json({ success: false, error: 'endpoint required' }, { status: 400 })
    }
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('endpoint', endpoint)
    if (error) {
      console.error('[push unsubscribe]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to remove subscription' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push unsubscribe]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
