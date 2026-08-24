import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidShareToken } from '@/lib/itinerary-share'
import { checkRateLimit } from '@/lib/rate-limit'
import { createNotification } from '@/lib/notifications'
import { sendPushToTenant } from '@/lib/push'

/**
 * "Report a problem" from the traveller share page. Token-authenticated (the
 * traveller has no login — the unrevoked share token IS the credential), on
 * the middleware self-auth allowlist. Everything except the message text and
 * an optional name is derived server-side from the share row: tenant,
 * itinerary, assignee. The report lands where the office already works — a
 * task on the trip — and alerts follow the existing rails (notification to
 * the trip owner, push to the tenant). Nothing here writes customer input
 * anywhere a traveller page could read it back unsanitized: tasks are an
 * internal, session-gated surface.
 */

const MAX_MESSAGE = 2000
const MAX_NAME = 120
// Second, store-backed cap behind the in-memory limiter (which resets on
// deploy): a leaked share link must not be able to bury the task list.
const MAX_REPORTS_PER_HOUR = 10

// Strip control characters (keep newlines and tabs -- travellers write
// multi-line messages), then trim and cap. Empty after cleaning = no input.
const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
  return s ? s.slice(0, max) : null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!isValidShareToken(token)) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`share-report:${ip}`, 'contact').success ||
        !checkRateLimit(`share-report:${token}`, 'contact').success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests — please try again in a minute.' },
        { status: 429 }
      )
    }

    const supabase = createAdminClient()
    const { data: share } = await supabase
      .from('itinerary_shares')
      .select('itinerary_id, tenant_id, revoked_at')
      .eq('token', token)
      .maybeSingle()
    if (!share || share.revoked_at) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }
    const { message: rawMessage, name: rawName } = (body ?? {}) as Record<string, unknown>
    const message = clean(rawMessage, MAX_MESSAGE)
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Please describe the problem.' },
        { status: 400 }
      )
    }
    const name = clean(rawName, MAX_NAME)

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('linked_type', 'itinerary')
      .eq('linked_id', share.itinerary_id)
      .like('title', 'Traveller report%')
      .gte('created_at', hourAgo)
    if ((count ?? 0) >= MAX_REPORTS_PER_HOUR) {
      return NextResponse.json(
        { success: false, error: 'Too many reports for this trip — please contact your operator directly.' },
        { status: 429 }
      )
    }

    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('trip_name, assigned_to')
      .eq('id', share.itinerary_id)
      .maybeSingle()

    const title = `Traveller report — ${itinerary?.trip_name ?? 'trip'}`
    const description = `${message}\n\n— ${name ?? 'a traveller'}, via the trip share page`
    const { data: task, error: insErr } = await supabase
      .from('tasks')
      .insert({
        tenant_id: share.tenant_id,
        title,
        description,
        priority: 'urgent',
        status: 'todo',
        assigned_to: itinerary?.assigned_to ?? null,
        linked_type: 'itinerary',
        linked_id: share.itinerary_id,
        archived: false,
      })
      .select('id')
      .single()
    if (insErr) {
      console.error('[share report POST] task insert failed:', insErr.message)
      return NextResponse.json(
        { success: false, error: 'Could not send your report — please contact your operator directly.' },
        { status: 500 }
      )
    }

    // Alerts are fire-and-forget by contract: the report is already a task,
    // and a notification failure must never turn into an error the traveller
    // sees. Recipients: the trip owner; for an ownerless trip, the office —
    // owners/managers, or with none of those, any active members (teams here
    // are small; a traveller problem going to everyone beats it going to
    // no one).
    void (async () => {
      try {
        let recipients: string[] = itinerary?.assigned_to ? [itinerary.assigned_to] : []
        if (recipients.length === 0) {
          const { data: members } = await supabase
            .from('team_members')
            .select('id, role')
            .eq('tenant_id', share.tenant_id)
            .eq('is_active', true)
            .limit(50)
          const office = (members ?? []).filter(m => m.role === 'owner' || m.role === 'manager')
          recipients = (office.length > 0 ? office : (members ?? [])).slice(0, 5).map(m => m.id)
        }
        await Promise.all(recipients.map(id =>
          createNotification({
            team_member_id: id,
            type: 'traveller_report',
            title,
            message,
            link: '/tasks',
            related_task_id: task.id,
            send_email: true,
          }).catch(err => console.error('[share report POST] notification failed:', err))
        ))
      } catch (err) {
        console.error('[share report POST] notification failed:', err)
      }
    })()
    void sendPushToTenant(share.tenant_id, {
      title,
      body: message.length > 120 ? `${message.slice(0, 117)}…` : message,
      url: '/tasks',
      tag: `report-${share.itinerary_id}`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[share report POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
