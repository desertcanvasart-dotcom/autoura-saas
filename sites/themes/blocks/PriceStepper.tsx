'use client'
// The tour's one public price, for the visitor's group: choose how many are
// travelling and read one per-person price and its total. Every amount is a
// band of the approved public rate — this only chooses which one to show.
// Nothing here knows, or asks, a nationality. The server renders the fewest
// travellers, so it reads the same without script.

import { useState } from 'react'
import type { TourFacts } from '@/lib/publish/contract'
import { formatApprox, formatDate, formatPrice, shownAmount } from './format'
import { t } from '../../i18n/strings'
import s from './stepper.module.css'

export function PriceStepper({ price, lang }: { price: TourFacts['price']; lang: string }) {
  const bands = price.bands
  const min = bands[0]?.minPax ?? 1
  const max = bands[bands.length - 1]?.maxPax ?? min
  const [pax, setPax] = useState(min)
  if (price.status !== 'available' || !bands.length) {
    return (
      <div className={s.stepper}>
        <p className={s.amount}>{t(lang, 'priceOnRequest')}</p>
        <p className={s.note}>{t(lang, 'askForPrice')}</p>
      </div>
    )
  }
  const perPerson = bands.find(b => pax >= b.minPax && pax <= b.maxPax)!.perPerson
  // The total is the shown per-person figure times the travellers, so the
  // two numbers on the page always agree.
  const total = shownAmount(perPerson) * pax
  const varies = bands.length > 1
  const usd = price.indicative[0]
  return (
    <div className={s.stepper}>
      <p className={s.amount}>{formatPrice(perPerson, price.currency, lang)}</p>
      <p className={s.note}>{t(lang, 'perPerson')}{price.tierLabel ? ` · ${price.tierLabel}` : ''}</p>
      {min !== max && (
        <div className={s.row}>
          <span id="pax-label" className={s.label}>{t(lang, 'travellersLabel')}</span>
          <div className={s.control} role="group" aria-labelledby="pax-label">
            <button type="button" className={s.step} onClick={() => setPax(p => Math.max(min, p - 1))} disabled={pax <= min} aria-label={t(lang, 'fewerTravellers')}>−</button>
            <output className={s.count} aria-live="polite">{pax}</output>
            <button type="button" className={s.step} onClick={() => setPax(p => Math.min(max, p + 1))} disabled={pax >= max} aria-label={t(lang, 'moreTravellers')}>+</button>
          </div>
        </div>
      )}
      <p className={s.total} aria-live="polite">
        <span>{t(lang, 'total')}</span>
        <strong>{formatPrice(total, price.currency, lang)}</strong>
      </p>
      {varies && <p className={s.note}>{t(lang, 'lowerForGroups')}</p>}
      {usd && (
        <p className={s.note}>
          {formatApprox(shownAmount(perPerson) * usd.rate, usd.currency, lang)} {t(lang, 'perPerson')} · {t(lang, 'indicative')} ({t(lang, 'youPayIn')} {price.currency}; {t(lang, 'rateOf')} {formatDate(usd.rateDate, lang)})
        </p>
      )}
    </div>
  )
}
