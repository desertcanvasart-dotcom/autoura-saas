'use client'
// Find your journey: the site's tours as photo cards, narrowed by length and
// by place. Every value on a card is the tour's own (its days, cities and the
// "from" its page shows); the filters only choose which cards to show. The
// server renders every card, so without script the whole list is there.

import { useMemo, useState } from 'react'
import { formatPrice } from '../blocks/format'
import { countOf, t } from '../../i18n/strings'
import s from './theme.module.css'

export interface FinderTour {
  title: string
  href: string
  photo: { src: string; alt: string }
  days: number | null
  nights: number | null
  cities: string[]
  from: { amount: number; currency: string } | null
}

type Length = 'any' | 'day' | 'short' | 'long'
const fits = (days: number | null, length: Length) =>
  length === 'any' || (days !== null && (length === 'day' ? days === 1 : length === 'short' ? days > 1 && days <= 4 : days >= 5))

export function TourFinder({ tours, lang, filters = true }: { tours: FinderTour[]; lang: string; filters?: boolean }) {
  const [length, setLength] = useState<Length>('any')
  const [place, setPlace] = useState('')
  const places = useMemo(() => [...new Set(tours.flatMap(x => x.cities))].sort((a, b) => a.localeCompare(b, lang)), [tours, lang])
  const lengths = (['any', 'day', 'short', 'long'] as const).filter(l => l === 'any' || tours.some(x => fits(x.days, l)))
  const shown = tours.filter(x => fits(x.days, length) && (!place || x.cities.includes(place)))
  const label: Record<Length, string> = { any: t(lang, 'anyLength'), day: t(lang, 'dayTrips'), short: t(lang, 'shortBreaks'), long: t(lang, 'longJourneys') }

  return (
    <div>
      {filters && tours.length > 3 && (
        <div className={s.finder} role="search" aria-label={t(lang, 'findJourney')}>
          <div className={s.toggleGroup} role="group" aria-label={t(lang, 'duration')}>
            {lengths.map(l => (
              <button key={l} type="button" className={s.toggle} aria-pressed={length === l} onClick={() => setLength(l)}>{label[l]}</button>
            ))}
          </div>
          {places.length > 1 && (
            <select className={s.select} value={place} onChange={e => setPlace(e.target.value)} aria-label={t(lang, 'destinationsTitle')}>
              <option value="">{t(lang, 'anywhere')}</option>
              {places.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
      )}
      {shown.length === 0 ? <p className={s.empty}>{t(lang, 'noMatch')}</p> : (
        <ul className={s.cards}>
          {shown.map(x => (
            <li key={x.href}>
              <a className={s.card} href={x.href}>
                {/* eslint-disable-next-line @next/next/no-img-element -- library or agency storage; sized by CSS */}
                <img src={x.photo.src} alt={x.photo.alt} className={s.cardImg} loading="lazy" decoding="async" />
                <span className={s.cardShade} aria-hidden="true" />
                {x.from && (
                  <span className={s.cardPrice}>{t(lang, 'from')} <strong>{formatPrice(x.from.amount, x.from.currency, lang)}</strong></span>
                )}
                <span className={s.cardBody}>
                  {x.days !== null && (
                    <span className={s.cardMeta}>
                      {x.nights ? `${countOf(lang, x.days, 'day')} · ${countOf(lang, x.nights, 'night')}` : countOf(lang, x.days, 'day')}
                      {x.cities.length > 0 && ` · ${x.cities.slice(0, 3).join(', ')}`}
                    </span>
                  )}
                  <span className={s.cardTitle}>{x.title}</span>
                  <span className={s.cardMore}>{t(lang, 'viewTour')} <span aria-hidden="true">→</span></span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
