// ============================================
// SAFE DELETE PRE-FLIGHT
// ============================================
// Two delete handlers (itinerary, client) destroyed child rows in separate
// statements and only THEN attempted the parent delete. When a RESTRICT or
// NO-ACTION foreign key blocked the parent, the children were already gone —
// the record survived, gutted, and the user was told "cannot delete" as if
// nothing had happened. Reproduced against production.
//
// The database deletes these correctly on its own via ON DELETE CASCADE /
// SET NULL, so the handlers now issue ONE atomic delete. This helper is the
// pre-flight that runs first: it turns a set of relationship counts into
// either a clean "blocked" message or a hard "could not verify" — because a
// COUNT query that ERRORED must never be read as "zero, safe to delete". That
// silent-empty confusion is the single most recurring bug class in this
// codebase.

export interface BlockerCheck {
  /** Human phrase for the relation, already pluralised, e.g. '3 booking(s)'. */
  label: string
  /** Row count from a head+count query. */
  count: number | null | undefined
  /** The query's error, if any. Presence here means the count is unreliable. */
  error?: unknown
}

export type DeleteGuardResult =
  | { ok: true }
  | { ok: false; kind: 'error'; label: string; message: string }
  | { ok: false; kind: 'blocked'; message: string }

/**
 * Decide whether a delete may proceed.
 *
 * - Any check whose `error` is set → 'error' (a failed count is not a zero).
 * - Any check with a positive count → 'blocked', listing every blocker.
 * - Otherwise → ok.
 *
 * `noun` is the thing being deleted ('itinerary', 'client'), used in the
 * blocked message.
 */
export function evaluateDeleteGuard(
  noun: string,
  checks: BlockerCheck[]
): DeleteGuardResult {
  for (const c of checks) {
    if (c.error) {
      return {
        ok: false,
        kind: 'error',
        label: c.label,
        message: `Could not verify whether this ${noun} is safe to delete (${c.label} check failed). Nothing was deleted.`,
      }
    }
  }

  const present = checks.filter((c) => (c.count ?? 0) > 0).map((c) => c.label)
  if (present.length > 0) {
    return {
      ok: false,
      kind: 'blocked',
      message:
        `Cannot delete this ${noun} — it has ${present.join(', ')} linked. ` +
        `Remove or reassign those first so no records are lost.`,
    }
  }

  return { ok: true }
}
