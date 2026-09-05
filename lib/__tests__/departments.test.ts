import { describe, it, expect } from 'vitest'
import { validateDepartmentInput, isNameTaken, DEPARTMENT_NAME_MAX } from '../departments'
import {
  ALL_SERVICE_TYPES,
  ROUTABLE_SERVICE_TYPES,
  isValidServiceType,
  serviceTypeLabel,
} from '../service-types'
import { SERVICE_TYPE_TO_DEPARTMENT } from '../ai/task-generation'

// ============================================================================
// Departments were seed-only until now: four global rows written by migration
// 214, with a GET-only API. Opening them to tenant CRUD introduces failure
// modes the seeds never had, and these tests pin the ones that would be
// invisible in normal use:
//
//   - a service_type outside the known vocabulary makes task auto-routing
//     silently stop matching (findDepartmentForServiceType returns null, and
//     the generated task lands unassigned)
//   - UNIQUE(tenant_id, name) treats NULL tenant_ids as distinct, so the DB
//     will NOT stop a tenant creating their own "Aviation" next to the global
//     one — two identical entries in every picker
// ============================================================================

describe('service type vocabulary', () => {
  it('stays in sync with the task router mapping', () => {
    // If someone adds a service type to the router but not here, the editor
    // silently can't express it — and vice versa, this offers a checkbox that
    // routes nothing. Both directions are drift.
    const routable = ROUTABLE_SERVICE_TYPES.map(t => t.value).sort()
    const routerTypes = Object.keys(SERVICE_TYPE_TO_DEPARTMENT).sort()

    expect(routable).toEqual(routerTypes)
  })

  it('marks back-office types as non-routable', () => {
    // These three are on the seeded Accounting department but no itinerary
    // service emits them, which is why Accounting receives no generated tasks.
    for (const value of ['invoice', 'payment', 'commission']) {
      expect(ALL_SERVICE_TYPES.find(t => t.value === value)?.routable).toBe(false)
    }
  })

  it('accepts every seeded value from migration 214', () => {
    const seeded = [
      'accommodation', 'cruise', 'meal', 'transportation',
      'flight',
      'guide', 'entrance', 'airport_service', 'hotel_service',
      'invoice', 'payment', 'commission',
    ]
    for (const value of seeded) {
      expect(isValidServiceType(value)).toBe(true)
    }
  })

  it('falls back to the raw value for an unknown label', () => {
    expect(serviceTypeLabel('not_a_type')).toBe('not_a_type')
  })
})

describe('validateDepartmentInput', () => {
  it('accepts a well-formed department', () => {
    const result = validateDepartmentInput({
      name: '  Ticketing  ',
      description: '  Entrance and museum tickets  ',
      service_types: ['entrance'],
    })

    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Ticketing',
        description: 'Entrance and museum tickets',
        service_types: ['entrance'],
        is_active: true,
      },
    })
  })

  it('accepts a CUSTOM snake_case service type, normalized like the server stores it', () => {
    // B-item 5: routing matches whatever the department owns, so the
    // vocabulary is no longer bounded by the curated list. 'teleportation'
    // is a perfectly good custom type now.
    const result = validateDepartmentInput({
      name: 'Ticketing',
      service_types: ['entrance', 'teleportation', ' Balloon Rides ', 'shore-excursion'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.service_types).toEqual(['entrance', 'teleportation', 'balloon_rides', 'shore_excursion'])
    }
  })

  it('still rejects garbage that normalizes to nothing', () => {
    const result = validateDepartmentInput({
      name: 'Ticketing',
      service_types: ['entrance', '!!!'],
    })
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ error: expect.stringContaining('!!!') })
  })

  it('a normalized custom type collides with its differently-spelled twin', () => {
    const result = validateDepartmentInput({
      name: 'Ticketing',
      service_types: ['Balloon Rides', 'balloon_rides'],
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.service_types).toEqual(['balloon_rides'])
  })

  it('rejects a name longer than the column', () => {
    const result = validateDepartmentInput({ name: 'x'.repeat(DEPARTMENT_NAME_MAX + 1) })
    expect(result.ok).toBe(false)
  })

  it('rejects a blank or whitespace-only name', () => {
    expect(validateDepartmentInput({ name: '   ' }).ok).toBe(false)
    expect(validateDepartmentInput({ name: '' }).ok).toBe(false)
    expect(validateDepartmentInput({}).ok).toBe(false)
  })

  it('rejects a non-array service_types', () => {
    const result = validateDepartmentInput({ name: 'Ops', service_types: 'entrance' })
    expect(result.ok).toBe(false)
  })

  it('de-duplicates repeated service types', () => {
    const result = validateDepartmentInput({
      name: 'Ops',
      service_types: ['guide', 'guide', 'entrance'],
    })

    expect(result.ok && result.value.service_types).toEqual(['guide', 'entrance'])
  })

  it('normalises an empty description to null', () => {
    const result = validateDepartmentInput({ name: 'Ops', description: '   ' })
    expect(result.ok && result.value.description).toBeNull()
  })

  it('defaults a new department to active with no service types', () => {
    const result = validateDepartmentInput({ name: 'Ops' })
    expect(result.ok && result.value).toMatchObject({ is_active: true, service_types: [] })
  })

  describe('partial (PATCH)', () => {
    it('validates only the keys supplied', () => {
      const result = validateDepartmentInput({ description: 'New blurb' }, { partial: true })
      expect(result).toEqual({ ok: true, value: { description: 'New blurb' } })
    })

    it('does not silently blank service_types when they are absent', () => {
      // A PATCH of just the name must not wipe the routing config.
      const result = validateDepartmentInput({ name: 'Renamed' }, { partial: true })
      expect(result.ok && 'service_types' in result.value).toBe(false)
    })

    it('still rejects a bad value when the key IS supplied', () => {
      // 'nope' is a valid CUSTOM type since B-item 5 — garbage now means
      // something that normalizes to nothing.
      const result = validateDepartmentInput({ service_types: ['???'] }, { partial: true })
      expect(result.ok).toBe(false)
    })

    it('rejects a non-boolean is_active', () => {
      const result = validateDepartmentInput({ is_active: 'yes' }, { partial: true })
      expect(result.ok).toBe(false)
    })
  })
})

describe('isNameTaken', () => {
  const existing = [
    { id: 'global-1', name: 'Aviation' },
    { id: 'tenant-1', name: 'Ticketing' },
  ]

  it('catches a collision with a global department', () => {
    // The DB unique index does NOT catch this — NULL tenant_ids are distinct.
    expect(isNameTaken('Aviation', existing)).toBe(true)
  })

  it('is case- and whitespace-insensitive', () => {
    expect(isNameTaken('  aVIATION  ', existing)).toBe(true)
  })

  it('allows a genuinely new name', () => {
    expect(isNameTaken('Transfers', existing)).toBe(false)
  })

  it('lets a department keep its own name on rename', () => {
    expect(isNameTaken('Ticketing', existing, 'tenant-1')).toBe(false)
  })

  it('still blocks renaming onto another department', () => {
    expect(isNameTaken('Aviation', existing, 'tenant-1')).toBe(true)
  })
})

// P6: routable-type exclusivity. Routing is first-match, so a double claim
// silently routes by load order — creation/update refuse it instead.
import { findClaimConflict } from '../departments'

describe('findClaimConflict', () => {
  const others = [
    { id: 'd1', name: 'Transport Desk', service_types: ['transportation'], is_active: true },
    { id: 'd2', name: 'Dormant', service_types: ['guide'], is_active: false },
  ]

  it('flags a type an active department already holds, naming the owner', () => {
    expect(findClaimConflict(['meal', 'transportation'], others))
      .toEqual({ type: 'transportation', owner: 'Transport Desk' })
  })

  it('ignores inactive departments and the department being edited', () => {
    expect(findClaimConflict(['guide'], others)).toBeNull()
    expect(findClaimConflict(['transportation'], others, 'd1')).toBeNull()
  })

  it('clean claim set passes', () => {
    expect(findClaimConflict(['meal'], others)).toBeNull()
    expect(findClaimConflict([], others)).toBeNull()
  })
})
