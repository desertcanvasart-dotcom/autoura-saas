/** A copy of `obj` without `keys` — for request bodies that must never set
 *  identity fields such as id or tenant_id (those come from the session). */
export function withoutKeys<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj ?? {})) if (!keys.includes(k)) out[k] = v
  return out
}

export const IDENTITY_KEYS = ['id', 'tenant_id', 'created_at', 'updated_at'] as const
