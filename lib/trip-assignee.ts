/**
 * Trip ownership helpers — validating and announcing `assigned_to` on
 * itineraries and bookings (migration 272).
 *
 * Why validation lives here rather than relying on the FK: a Postgres foreign
 * key check does not run RLS, so `assigned_to` would happily accept a
 * team_members id from another tenant. Migration 272 adds a trigger as the
 * backstop, but a trigger failure surfaces as a 500; validating first lets the
 * API return a clean 400 and a message the UI can show.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

export type AssigneeCheck =
  | { ok: true; member: { id: string; name: string } }
  | { ok: false; error: string }

/**
 * Confirm `assigneeId` is an active team member the caller is allowed to
 * assign to.
 *
 * Pass `tenantId` when the client bypasses RLS (admin client) — it becomes an
 * explicit filter. With an authenticated client RLS already scopes
 * team_members to the caller's tenant, so `tenantId` may be omitted.
 */
export async function validateAssignee(
  supabase: SupabaseClient,
  assigneeId: string,
  tenantId?: string | null
): Promise<AssigneeCheck> {
  let query = supabase
    .from('team_members')
    .select('id, name, is_active')
    .eq('id', assigneeId)

  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query.maybeSingle()

  if (error) return { ok: false, error: 'Failed to verify assignee' }
  if (!data) return { ok: false, error: 'Assignee is not a team member of this tenant' }

  const member = data as { id: string; name: string; is_active: boolean | null }
  if (member.is_active === false) {
    return { ok: false, error: 'Cannot assign a trip to an inactive team member' }
  }

  return { ok: true, member: { id: member.id, name: member.name } }
}

/**
 * Notify the new owner that a trip landed on their plate.
 *
 * Never throws: an assignment that saved but failed to notify is still a
 * successful assignment, and the caller has already written the row.
 */
export async function notifyTripAssignment(input: {
  assigneeId: string
  tripLabel: string
  kind: 'itinerary' | 'booking'
  link: string
}): Promise<void> {
  try {
    await createNotification({
      team_member_id: input.assigneeId,
      type: 'trip_assigned',
      title: `You now own ${input.tripLabel}`,
      message:
        input.kind === 'booking'
          ? `You have been assigned to operate booking ${input.tripLabel}.`
          : `You have been assigned to itinerary ${input.tripLabel}.`,
      link: input.link,
      send_email: true,
    })
  } catch (error) {
    console.error('Failed to send trip assignment notification:', error)
  }
}
