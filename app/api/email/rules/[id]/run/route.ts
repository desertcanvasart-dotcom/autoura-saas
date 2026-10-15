import { NextRequest, NextResponse } from 'next/server'
import { mailboxForSession } from '@/lib/gmail-mailbox'
import { roleDenied } from '@/lib/api-role-gate'
import { gmailQueryFor, planFromActions, type MailRule } from '@/lib/email/mail-rules'
import { applyPlan } from '@/lib/email/apply-rules'
import { MAX_ACTION_IDS } from '@/lib/email/mail-actions'

// POST /api/email/rules/[id]/run
// "Apply to Inbox now": run one rule on matching emails already in the
// caller's own Inbox (new mail is handled at each sync). Up to
// MAX_ACTION_IDS emails; managers and admins only, like editing rules.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await mailboxForSession()
    if (!session.ok) return session.response
    const denied = roleDenied(session.role, 'manage')
    if (denied) return denied
    const { id } = await params

    const { data: rule } = await (session.admin as unknown as Db)
      .from('email_rules')
      .select('id, name, enabled, conditions, actions')
      .eq('id', id)
      .eq('tenant_id', session.tenantId)
      .maybeSingle()
    if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

    const r = rule as MailRule
    if (Object.keys(r.conditions ?? {}).length === 0) {
      return NextResponse.json({ error: 'This rule has no conditions' }, { status: 400 })
    }
    // Gmail's search finds the matching emails; the change is the rule's own.
    const plan = planFromActions([r.actions])

    const ids: string[] = []
    let pageToken: string | undefined
    let truncated = false
    do {
      const { data } = await session.gmail.users.messages.list({
        userId: 'me', q: gmailQueryFor(r.conditions), maxResults: 500, ...(pageToken ? { pageToken } : {}),
      })
      for (const m of data.messages ?? []) if (m.id) ids.push(m.id)
      pageToken = data.nextPageToken ?? undefined
      if (ids.length >= MAX_ACTION_IDS) { truncated = Boolean(pageToken) || ids.length > MAX_ACTION_IDS; break }
    } while (pageToken)

    const { count } = await applyPlan(session.gmail, ids.slice(0, MAX_ACTION_IDS), plan)
    return NextResponse.json({ success: true, applied: count, truncated })
  } catch (err) {
    const e = err as { message?: string }
    console.error('Run rule error:', e?.message || err)
    return NextResponse.json({ error: e?.message || 'Could not apply the rule' }, { status: 500 })
  }
}
