'use client'
// The price for your group: choose how many are travelling (and, where the
// rates differ, EU passport or other nationality). Every amount is a row of
// the records' own price table — this only chooses which one to show. The
// server renders the 2-traveller price, so it reads the same without script.

import { useState } from 'react'
import type { TourFacts } from '@/lib/publish/contract'
import { formatPrice } from '../blocks/format'
import { t } from '../../i18n/strings'
import s from './theme.module.css'

type Nationality = 'eu' | 'other'

export function PriceExplorer({ price, lang }: { price: TourFacts['price']; lang: string }) {
  const rows = price.table.filter(r => (r.perPerson ?? r.eu ?? r.other) !== null)
  const split = price.byNationality !== null
  const [pax, setPax] = useState(rows[0]?.pax ?? price.basis.pax)
  // Open on the cheaper nationality: the same "from" the page's text states.
  const [who, setWho] = useState<Nationality>(price.byNationality && price.byNationality.other < price.byNationality.eu ? 'other' : 'eu')
  if (price.status !== 'available' || !price.from) {
    return (
      <div className={s.priceCard}>
        <p className={s.priceLabel}>{t(lang, 'priceOnRequest')}</p>
        <p className={s.priceNote}>{t(lang, 'askForPrice')}</p>
      </div>
    )
  }
  const row = rows.find(r => r.pax === pax)
  const amount = row ? (split ? (who === 'eu' ? row.eu : row.other) : row.perPerson) ?? null
    : split ? (who === 'eu' ? price.byNationality!.eu : price.byNationality!.other) : price.from.perPerson
  return (
    <div className={s.priceCard}>
      <p className={s.priceLabel}>{t(lang, 'from')}</p>
      <p className={s.priceAmount}>{amount !== null ? formatPrice(amount, price.currency, lang) : '—'}</p>
      <p className={s.priceNote}>{t(lang, 'perPerson')} · {price.from.tierLabel}</p>
      {rows.length > 1 && (
        <div className={s.toggleGroup} role="group" aria-label={t(lang, 'groupSize')}>
          {rows.map(r => (
            <button key={r.pax} type="button" aria-pressed={r.pax === pax} onClick={() => setPax(r.pax)} className={s.toggle}>
              {r.pax} {t(lang, 'travellers')}
            </button>
          ))}
        </div>
      )}
      {split && (
        <div className={s.toggleGroup} role="group" aria-label={t(lang, 'euPassport')}>
          <button type="button" aria-pressed={who === 'eu'} onClick={() => setWho('eu')} className={s.toggle}>{t(lang, 'euPassport')}</button>
          <button type="button" aria-pressed={who === 'other'} onClick={() => setWho('other')} className={s.toggle}>{t(lang, 'otherNationalities')}</button>
        </div>
      )}
    </div>
  )
}
