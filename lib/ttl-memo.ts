// ============================================
// A short-lived memo that asks once, not once per caller
// ============================================
// Several modules kept the same hand-rolled shape: a Map of
// { at, value } with a TTL. It stores the ANSWER, so callers that arrive
// together all miss and all fetch — and once the pricing engine started
// pricing its tiers concurrently, "the tenant's tier ladder" went from one
// request to four.
//
// Storing the PROMISE fixes it: the first caller starts the read, everyone
// who arrives while it is in flight waits on that same read. A failed read is
// dropped rather than remembered, so the next caller tries again instead of
// inheriting an error for the rest of the TTL.

export interface TtlMemo<T> {
  (key: string, load: () => Promise<T>): Promise<T>
  /** Tests and anything that must not read its own stale answer. */
  clear(): void
}

export function ttlMemo<T>(ttlMs: number): TtlMemo<T> {
  const entries = new Map<string, { at: number; value: Promise<T> }>()

  const get = ((key: string, load: () => Promise<T>) => {
    const hit = entries.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value

    const value = load()
    entries.set(key, { at: Date.now(), value })
    value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key) })
    return value
  }) as TtlMemo<T>

  get.clear = () => entries.clear()
  return get
}
