// The cancellation terms as a row of cells, and their one-line headline.
// A policy lists what is charged when a booking is cancelled N days or fewer
// before departure; before its earliest charge nothing is charged, so the
// first cell is that free window ("46+ days: Free"). Every figure is the
// policy's — nothing here adds a term it does not state.

import type { TourFacts } from '@/lib/publish/contract'
import { t } from '../../i18n/strings'
import { formatPercent } from './format'

type Tiers = NonNullable<TourFacts['cancellation']>['tiers']

export interface CancelCell { when: string; charge: string; free: boolean }

const sorted = (tiers: Tiers) => [...tiers].sort((a, b) => b.daysBefore - a.daysBefore)

/** The days before departure up to which cancelling costs nothing (0 = it
 *  never costs anything); null when the policy states no tiers. */
export function freeUntilDays(tiers: Tiers): number | null {
  if (tiers.length === 0) return null
  const charged = sorted(tiers).filter(x => x.chargePercent > 0)
  // No charge at any point: free up to the day itself.
  return charged.length === 0 ? 0 : charged[0].daysBefore + 1
}

export function cancellationCells(tiers: Tiers, lang: string): CancelCell[] {
  const list = sorted(tiers)
  if (list.length === 0) return []
  const days = (n: number) => `${n} ${t(lang, 'days')}`
  const cells: CancelCell[] = []
  if (list[0].daysBefore > 0 && list[0].chargePercent > 0) {
    cells.push({ when: `${list[0].daysBefore + 1}+ ${t(lang, 'days')}`, charge: t(lang, 'cancelFree'), free: true })
  }
  list.forEach((tier, i) => {
    const upper = tier.daysBefore
    const lower = i + 1 < list.length ? list[i + 1].daysBefore + 1 : 0
    const when = upper === 0 ? t(lang, 'cancelOnDay') : lower === upper ? days(upper) : `${lower}–${days(upper)}`
    const free = tier.chargePercent === 0
    cells.push({ when, charge: free ? t(lang, 'cancelFree') : formatPercent(tier.chargePercent, lang), free })
  })
  return cells
}

/** "Free cancellation up to 46 days before" — or null. */
export function cancellationHeadline(c: TourFacts['cancellation'], lang: string): string | null {
  if (!c) return null
  const n = freeUntilDays(c.tiers)
  if (n === null || n === 0) return null
  return `${t(lang, 'freeCancellationUpTo')} ${n} ${t(lang, 'daysBefore')}`
}
