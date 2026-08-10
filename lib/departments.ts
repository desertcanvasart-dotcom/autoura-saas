/**
 * Department input validation, shared by the create and update routes.
 *
 * Kept as pure functions so the rules are unit-testable without a database:
 * the interesting cases here are the ones a happy-path click-through never
 * reaches (a name that collides with a global department, an unknown
 * service_type, a name longer than the column).
 */

import { isValidServiceType } from '@/lib/service-types'

/** departments.name is VARCHAR(100). */
export const DEPARTMENT_NAME_MAX = 100

export interface DepartmentInput {
  name?: unknown
  description?: unknown
  service_types?: unknown
  is_active?: unknown
}

export interface CleanDepartment {
  name: string
  description: string | null
  service_types: string[]
  is_active: boolean
}

export type ValidationResult =
  | { ok: true; value: CleanDepartment }
  | { ok: false; error: string }

/**
 * Validate and normalise a department payload.
 *
 * `partial` is for PATCH: only the supplied keys are validated, and the result
 * carries just those keys. Callers should spread the result into their update.
 */
export function validateDepartmentInput(
  input: DepartmentInput,
  { partial = false }: { partial?: boolean } = {}
): ValidationResult {
  const value: Partial<CleanDepartment> = {}

  if (!partial || input.name !== undefined) {
    if (typeof input.name !== 'string') {
      return { ok: false, error: 'Name is required' }
    }
    const name = input.name.trim()
    if (!name) {
      return { ok: false, error: 'Name is required' }
    }
    if (name.length > DEPARTMENT_NAME_MAX) {
      return { ok: false, error: `Name must be ${DEPARTMENT_NAME_MAX} characters or fewer` }
    }
    value.name = name
  }

  if (!partial || input.description !== undefined) {
    if (input.description === null || input.description === undefined || input.description === '') {
      value.description = null
    } else if (typeof input.description !== 'string') {
      return { ok: false, error: 'Description must be text' }
    } else {
      value.description = input.description.trim() || null
    }
  }

  if (!partial || input.service_types !== undefined) {
    const raw = input.service_types === undefined || input.service_types === null
      ? []
      : input.service_types
    if (!Array.isArray(raw)) {
      return { ok: false, error: 'Service types must be a list' }
    }
    const seen = new Set<string>()
    for (const entry of raw) {
      if (typeof entry !== 'string' || !isValidServiceType(entry)) {
        return { ok: false, error: `Unknown service type: ${String(entry)}` }
      }
      seen.add(entry)
    }
    value.service_types = [...seen]
  }

  if (!partial || input.is_active !== undefined) {
    if (input.is_active === undefined) {
      value.is_active = true
    } else if (typeof input.is_active !== 'boolean') {
      return { ok: false, error: 'Active flag must be true or false' }
    } else {
      value.is_active = input.is_active
    }
  }

  return { ok: true, value: value as CleanDepartment }
}

/**
 * Is `name` already taken among `existing`?
 *
 * Compared case-insensitively and trimmed, which is stricter than the DB's
 * `UNIQUE(tenant_id, name)`. That matters because the unique index treats NULL
 * tenant_ids as distinct, so it would happily let a tenant create their own
 * "Aviation" alongside the seeded global one — producing two identically
 * named entries in every picker with no way to tell them apart.
 *
 * `ignoreId` lets a rename keep its own name.
 */
export function isNameTaken(
  name: string,
  existing: { id: string; name: string }[],
  ignoreId?: string
): boolean {
  const target = name.trim().toLowerCase()
  return existing.some(
    d => d.id !== ignoreId && d.name.trim().toLowerCase() === target
  )
}
