import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidStaffToken, toStaffView } from '@/lib/staff-link'
import TapButtons from './TapButtons'

// The tap-link page: no login, the token is the credential (middleware opens
// the path; this page 404s anything that does not resolve to an active link
// on a live assignment). Everything rendered goes through toStaffView — the
// holder of a link sees their own assignment and nothing else.

export const dynamic = 'force-dynamic'

export default async function StaffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isValidStaffToken(token)) notFound()

  const supabase = createAdminClient()
  const { data: link } = await supabase
    .from('staff_links')
    .select('tenant_id, itinerary_id, itinerary_resource_id')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()
  if (!link) notFound()

  const [{ data: resource }, { data: itinerary }, { data: tenant }, { data: events }] = await Promise.all([
    supabase
      .from('itinerary_resources')
      .select('resource_name, start_date, end_date, status')
      .eq('id', link.itinerary_resource_id)
      .maybeSingle(),
    supabase
      .from('itineraries')
      .select('trip_name, start_date, end_date')
      .eq('id', link.itinerary_id)
      .maybeSingle(),
    supabase
      .from('tenants')
      .select('company_name')
      .eq('id', link.tenant_id)
      .maybeSingle(),
    supabase
      .from('trip_events')
      .select('event_kind, occurred_at')
      .eq('itinerary_resource_id', link.itinerary_resource_id)
      .order('occurred_at', { ascending: false })
      .limit(15),
  ])
  if (!resource || resource.status === 'cancelled' || !itinerary) notFound()

  const view = toStaffView(
    (tenant ?? {}) as Record<string, unknown>,
    itinerary as Record<string, unknown>,
    resource as Record<string, unknown>,
    (events ?? []) as Array<Record<string, unknown>>
  )

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-5 py-6">
        <p className="text-xs uppercase tracking-widest text-gray-400">{view.operatorName}</p>
        <h1 className="text-xl font-semibold mt-1">{view.tripTitle}</h1>
        <p className="text-sm text-gray-300 mt-1">
          Hi {view.memberName}
          {view.assignmentStart && (
            <> — your dates: {fmtDate(view.assignmentStart)}
              {view.assignmentEnd && view.assignmentEnd !== view.assignmentStart && <> – {fmtDate(view.assignmentEnd)}</>}
            </>
          )}
        </p>
      </header>
      <div className="max-w-md mx-auto px-4 py-6">
        <TapButtons token={token} initialEvents={view.events} />
      </div>
    </main>
  )
}
