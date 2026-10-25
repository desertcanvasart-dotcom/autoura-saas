// ============================================
// Publish sync — who is told when a company's site falls out of step
// ============================================
//   The company: a bell item (and push) to its owners, admins and managers —
//     one item per company, updated in place (dedupe key), so a long outage
//     is one line, not one per alert.
//   Us: the ops webhook (ALERT_WEBHOOK_URL, as server errors use) and an
//     email to SUPER_ADMIN_EMAILS — a sync problem is usually ours to fix.
// Each channel is best-effort and independent: one being down never stops
// the others, and the health row has already recorded the state.

import { notifyTeam } from '@/lib/notifications'
import { sendSystemEmail } from '@/lib/email'
import { escapeHtml } from '@/lib/html-escape'
import { redactText } from '@/lib/support/bundle'
import type { SyncAlert } from './worker'

const COMPANY_ROLES = ['owner', 'admin', 'manager']

const STATE_WORDS: Record<string, string> = {
  failing: 'cannot update your website',
  lagging: 'is behind updating your website',
  stalled: 'has stopped updating your website',
}

export function alertCopy(a: SyncAlert): { title: string; message: string; ops: string } {
  const who = a.companyName ?? a.tenantId
  if (a.kind === 'recovered') {
    return {
      title: 'Website back in step',
      message: 'Price and tour changes are reaching your website again.',
      ops: `✅ Publish sync recovered — ${who}`,
    }
  }
  return {
    title: 'Website not updating',
    message: `Autoura ${STATE_WORDS[a.status] ?? 'has a sync problem'}: recent price or tour changes may not show yet. We have been alerted.`,
    ops: `🚨 Publish sync ${a.status.toUpperCase()} — ${who}${a.detail ? `\n${redactText(a.detail).slice(0, 400)}` : ''}`,
  }
}

export async function sendSyncAlert(a: SyncAlert): Promise<void> {
  const copy = alertCopy(a)
  const jobs: Array<Promise<unknown>> = [
    notifyTeam({
      tenant_id: a.tenantId,
      dedupe_key: `publish-sync:${a.tenantId}`,
      type: 'publish_sync',
      title: copy.title,
      message: copy.message,
      link: null, // → the Publish overview once its admin screen exists (PLAN §15)
      roles: COMPANY_ROLES,
    }),
  ]

  const webhook = process.env.ALERT_WEBHOOK_URL
  if (webhook) {
    jobs.push(fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: copy.ops, content: copy.ops }),
      signal: AbortSignal.timeout(5000),
    }))
  }
  for (const to of (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)) {
    jobs.push(sendSystemEmail({
      to,
      subject: copy.ops.split('\n')[0],
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(copy.ops)}</pre>`,
    }))
  }

  const results = await Promise.allSettled(jobs)
  for (const r of results) {
    if (r.status === 'rejected') console.error('[publish-sync] alert channel failed:', r.reason instanceof Error ? r.reason.message : r.reason)
  }
}
