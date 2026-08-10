import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Trip ownership (migration 272) — `assigned_to` on itineraries / bookings.
//
// The security-relevant part of this feature is NOT the column, it is the
// tenant check. A Postgres FK check does not run RLS, so the constraint alone
// accepts a team_members id from any tenant; the bookings route makes that
// worse by using the admin client, which bypasses RLS outright. These tests
// pin the two things that keep one tenant from naming another tenant's staff
// as the owner of their trip:
//
//   1. an unknown / foreign assignee is rejected, not silently written
//   2. the tenant filter is actually applied when a tenant id is supplied
//
// Plus the softer rule that an inactive member can't be handed new work.
// ============================================================================

const mockCreateNotification = vi.fn()

vi.mock('@/lib/notifications', () => ({
  createNotification: (...a: unknown[]) => mockCreateNotification(...a),
}))

const { validateAssignee, notifyTripAssignment } = await import('../trip-assignee')

/**
 * Minimal Supabase query-builder double. Records the filters applied so a test
 * can assert the tenant scope was requested, not just that the call succeeded.
 */
function stubClient(result: { data: unknown; error: unknown }) {
  const filters: Record<string, unknown> = {}
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters[col] = val
      return builder
    },
    maybeSingle: async () => result,
  }
  return {
    client: { from: () => builder } as never,
    filters,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('validateAssignee', () => {
  it('accepts an active member of the tenant', async () => {
    const { client } = stubClient({
      data: { id: 'member-1', name: 'Sara', is_active: true },
      error: null,
    })

    const result = await validateAssignee(client, 'member-1', 'tenant-1')

    expect(result).toEqual({ ok: true, member: { id: 'member-1', name: 'Sara' } })
  })

  it('rejects an assignee that is not in the tenant', async () => {
    // RLS (or the explicit tenant filter) makes a foreign member invisible,
    // which surfaces as no row rather than as an error.
    const { client } = stubClient({ data: null, error: null })

    const result = await validateAssignee(client, 'member-from-other-tenant', 'tenant-1')

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ error: expect.stringContaining('not a team member') })
  })

  it('applies the tenant filter when a tenant id is supplied', async () => {
    const { client, filters } = stubClient({
      data: { id: 'member-1', name: 'Sara', is_active: true },
      error: null,
    })

    await validateAssignee(client, 'member-1', 'tenant-1')

    // This is the whole defence for the admin-client path.
    expect(filters).toEqual({ id: 'member-1', tenant_id: 'tenant-1' })
  })

  it('omits the tenant filter when none is supplied, leaving it to RLS', async () => {
    const { client, filters } = stubClient({
      data: { id: 'member-1', name: 'Sara', is_active: true },
      error: null,
    })

    await validateAssignee(client, 'member-1')

    expect(filters).toEqual({ id: 'member-1' })
  })

  it('refuses to assign a trip to a deactivated member', async () => {
    const { client } = stubClient({
      data: { id: 'member-1', name: 'Former Staff', is_active: false },
      error: null,
    })

    const result = await validateAssignee(client, 'member-1', 'tenant-1')

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ error: expect.stringContaining('inactive') })
  })

  it('treats a null is_active as assignable (column defaults to true)', async () => {
    const { client } = stubClient({
      data: { id: 'member-1', name: 'Sara', is_active: null },
      error: null,
    })

    const result = await validateAssignee(client, 'member-1', 'tenant-1')

    expect(result.ok).toBe(true)
  })

  it('fails closed when the lookup itself errors', async () => {
    const { client } = stubClient({ data: null, error: { message: 'boom' } })

    const result = await validateAssignee(client, 'member-1', 'tenant-1')

    expect(result.ok).toBe(false)
  })
})

describe('notifyTripAssignment', () => {
  it('notifies the new owner with a link back to the record', async () => {
    mockCreateNotification.mockResolvedValue({})

    await notifyTripAssignment({
      assigneeId: 'member-1',
      tripLabel: 'BK-1042',
      kind: 'booking',
      link: '/bookings/abc',
    })

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        team_member_id: 'member-1',
        type: 'trip_assigned',
        link: '/bookings/abc',
        send_email: true,
      })
    )
  })

  it('swallows notification failures — the assignment is already saved', async () => {
    mockCreateNotification.mockRejectedValue(new Error('smtp down'))

    await expect(
      notifyTripAssignment({
        assigneeId: 'member-1',
        tripLabel: 'Nile Cruise',
        kind: 'itinerary',
        link: '/itineraries/abc',
      })
    ).resolves.toBeUndefined()
  })
})
