// ============================================
// Does each paid attraction of a block land on a fee?
// ============================================
// A block lists the attractions it pays entry for by name. When the block is
// priced, each name goes through the agency's attraction aliases and then to
// its entrance-fee sheet — the engine's own rules (lib/pricing/alias-admin).
// A name that lands on no fee would price as nothing, so the library shows it
// before any trip is built from the block.

import { aliasHealth, type FeeName } from '@/lib/pricing/alias-admin'
import { resolveAttractionAlias } from '@/lib/pricing/attraction-aliases'
import { COMBO_SEPARATOR } from '@/lib/pricing/alias-shared'

export interface AttractionCheck {
  name: string
  ok: boolean
  /** The fee(s) it prices as, when it lands. */
  fees?: string[]
  problem?: string
}

export function checkBlockAttractions(
  attractions: readonly string[],
  fees: readonly FeeName[],
  aliasIndex: Map<string, string>
): AttractionCheck[] {
  return attractions.map(name => {
    const canonical = resolveAttractionAlias(name, aliasIndex).join(COMBO_SEPARATOR)
    const health = aliasHealth(canonical, fees)
    return health.ok
      ? { name, ok: true, fees: health.fees }
      : { name, ok: false, problem: health.problem }
  })
}
