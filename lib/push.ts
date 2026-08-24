import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================
// WEB PUSH — checkpoint alerts for the ops PWA
// ============================================
// Fire-and-forget by contract: a driver's tap must NEVER fail because push is
// unconfigured, a browser endpoint died, or the push service hiccuped. Every
// path in here swallows and logs; the only externally visible behaviour is
// notifications arriving — or a console line explaining why they didn't.

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  )
}

/**
 * Notify every subscribed browser of a tenant. Dead endpoints (404/410 from
 * the push service) are pruned so the table tracks reality.
 */
export async function sendPushToTenant(tenantId: string, payload: PushPayload): Promise<void> {
  try {
    if (!isPushConfigured()) {
      console.log('[push] not configured (VAPID env missing) — skipping')
      return
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    const supabase = createAdminClient()
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('tenant_id', tenantId)
    if (error || !subs || subs.length === 0) {
      if (error) console.error('[push] load subscriptions failed:', error.message)
      return
    }

    const body = JSON.stringify(payload)
    const results = await Promise.allSettled(
      subs.map(s =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        )
      )
    )

    const dead: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const code = (r.reason as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) dead.push(subs[i].id)
        else console.error('[push] send failed:', code ?? r.reason)
      }
    })
    if (dead.length) {
      await supabase.from('push_subscriptions').delete().in('id', dead)
      console.log(`[push] pruned ${dead.length} dead subscription(s)`)
    }
  } catch (err) {
    console.error('[push] unexpected:', err)
  }
}
