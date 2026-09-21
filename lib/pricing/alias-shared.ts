// ============================================
// Attraction aliases — the part a browser may load
// ============================================
// The Settings screen is a client component. Everything it needs at RUN time
// lives here, and this file imports NOTHING: lib/pricing/alias-admin.ts pulls
// in the engine's alias loader, which pulls in the query memo, which needs
// node:async_hooks — and a production build refuses to put that in a browser
// bundle ("the chunking context does not support external modules"). Type
// checks and unit tests do not notice; only `next build` does.

export const COMBO_SEPARATOR = ' + '
export const MAX_ALIAS_LENGTH = 120

export interface FeeName { attraction_name: string; city?: string | null }

export type AliasHealth =
  | { ok: true; fees: string[] }
  | { ok: false; problem: string }

export interface UnresolvedWording {
  wording: string
  /** What the engine actually looks up, when an alias already rewrites it. */
  lookedUpAs: string
  days: number
  tours: string[]
  reason: 'no_fee' | 'several_fees'
  candidates: string[]
}

export function canonicalParts(canonical: string): string[] {
  return canonical.split(COMBO_SEPARATOR).map(p => p.trim()).filter(Boolean)
}
