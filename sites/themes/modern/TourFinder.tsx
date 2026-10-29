'use client'
// The site's tours as photo cards, narrowed by type, length and place, in
// the order the visitor picks, a page at a time. Every value on a card is the
// tour's own (its days, cities, type and the "from" its page shows); the
// controls only choose which cards to show. The server renders the first
// page with every control at rest, so without script the cards are there.

import { useMemo, useState } from 'react'
import { formatPrice } from '../blocks/format'
import { countOf, t } from '../../i18n/strings'
import s from './theme.module.css'

export interface FinderTour {
  title: string
  href: string
  /** null: no photo of its own and no library — a colour panel instead. */
  photo: { src: string; alt: string } | null
  days: number | null
  nights: number | null
  hours?: number | null
  cities: string[]
  type?: string | null
  from: { amount: number; currency: string } | null
}

type Length = 'any' | 'day' | 'short' | 'long'
type Sort = 'recommended' | 'priceAsc' | 'priceDesc' | 'duration'
const fits = (days: number | null, length: Length) =>
  length === 'any' || (days !== null && (length === 'day' ? days === 1 : length === 'short' ? days > 1 && days <= 4 : days >= 5))
const PAGE = 9

/** chips: the type chips. full: length, place, sort and pages too (the tours listing). */
export function TourFinder({ tours, lang, mode = 'chips', limit }: { tours: FinderTour[]; lang: string; mode?: 'none' | 'chips' | 'full'; limit?: number }) {
  const [type, setType] = useState('')
  const [length, setLength] = useState<Length>('any')
  const [place, setPlace] = useState('')
  const [sort, setSort] = useState<Sort>('recommended')
  const [page, setPage] = useState(0)
  const types = useMemo(() => [...new Set(tours.map(x => x.type).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, lang)), [tours, lang])
  const places = useMemo(() => [...new Set(tours.flatMap(x => x.cities))].sort((a, b) => a.localeCompare(b, lang)), [tours, lang])
  const lengths = (['any', 'day', 'short', 'long'] as const).filter(l => l === 'any' || tours.some(x => fits(x.days, l)))
  const label: Record<Length, string> = { any: t(lang, 'anyLength'), day: t(lang, 'dayTrips'), short: t(lang, 'shortBreaks'), long: t(lang, 'longJourneys') }

  const matching = tours.filter(x => (!type || x.type === type) && fits(x.days, length) && (!place || x.cities.includes(place)))
  // A tour with its price on request sorts after every priced one.
  const price = (x: FinderTour, dir: 1 | -1) => x.from ? x.from.amount * dir : Number.POSITIVE_INFINITY
  const ordered = sort === 'recommended' ? matching : [...matching].sort((a, b) =>
    sort === 'priceAsc' ? price(a, 1) - price(b, 1)
      : sort === 'priceDesc' ? price(a, -1) - price(b, -1)
        : (a.days ?? 99) - (b.days ?? 99) || (a.hours ?? 99) - (b.hours ?? 99))
  const pages = mode === 'full' ? Math.max(1, Math.ceil(ordered.length / PAGE)) : 1
  const at = Math.min(page, pages - 1)
  const shown = mode === 'full' ? ordered.slice(at * PAGE, at * PAGE + PAGE) : ordered.slice(0, limit ?? ordered.length)
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0) }

  return (
    <div>
      {mode !== 'none' && types.length > 1 && (
        <div className={s.chipRow} role="group" aria-label={t(lang, 'typeLabel')}>
          {['', ...types].map(x => (
            <button key={x || 'all'} type="button" className={s.toggle} aria-pressed={type === x} onClick={() => reset(setType)(x)}>{x || t(lang, 'allTypes')}</button>
          ))}
        </div>
      )}
      {mode === 'full' && (
        <div className={s.finder} role="search" aria-label={t(lang, 'findJourney')}>
          <div className={s.toggleGroup} role="group" aria-label={t(lang, 'duration')}>
            {lengths.length > 2 && lengths.map(l => (
              <button key={l} type="button" className={s.toggle} aria-pressed={length === l} onClick={() => reset(setLength)(l)}>{label[l]}</button>
            ))}
          </div>
          <div className={s.finderEnd}>
            {places.length > 1 && (
              <select className={s.select} value={place} onChange={e => reset(setPlace)(e.target.value)} aria-label={t(lang, 'destinationsTitle')}>
                <option value="">{t(lang, 'anywhere')}</option>
                {places.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <label className={s.sortLabel}>
              <span>{t(lang, 'sortLabel')}</span>
              <select className={s.select} value={sort} onChange={e => reset(setSort)(e.target.value as Sort)}>
                <option value="recommended">{t(lang, 'sortRecommended')}</option>
                <option value="priceAsc">{t(lang, 'sortPriceAsc')}</option>
                <option value="priceDesc">{t(lang, 'sortPriceDesc')}</option>
                <option value="duration">{t(lang, 'sortDuration')}</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {shown.length === 0 ? <p className={s.empty}>{t(lang, 'noMatch')}</p> : (
        <ul className={s.cards}>
          {shown.map(x => <li key={x.href}><TourCard tour={x} lang={lang} /></li>)}
        </ul>
      )}
      {pages > 1 && (
        <nav className={s.pager} aria-label={t(lang, 'pageWord')}>
          <button type="button" className={s.toggle} disabled={at === 0} onClick={() => setPage(at - 1)}>{t(lang, 'prevPage')}</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" className={s.toggle} aria-pressed={i === at} aria-label={`${t(lang, 'pageWord')} ${i + 1}`} onClick={() => setPage(i)}>{i + 1}</button>
          ))}
          <button type="button" className={s.toggle} disabled={at === pages - 1} onClick={() => setPage(at + 1)}>{t(lang, 'nextPage')}</button>
        </nav>
      )}
    </div>
  )
}

function lengthOf(x: FinderTour, lang: string): string | null {
  if (x.days === null) return null
  if (x.days === 1 && x.hours) return `${x.hours} ${t(lang, x.hours === 1 ? 'oneHour' : 'hours')}`
  return x.nights ? `${countOf(lang, x.days, 'day')} · ${countOf(lang, x.nights, 'night')}` : countOf(lang, x.days, 'day')
}

export function TourCard({ tour: x, lang }: { tour: FinderTour; lang: string }) {
  const length = lengthOf(x, lang)
  return (
    <a className={s.card} href={x.href}>
      <span className={s.cardMedia}>
        {x.photo
          // eslint-disable-next-line @next/next/no-img-element -- library or agency storage; sized by CSS
          ? <img src={x.photo.src} alt={x.photo.alt} className={s.cardImg} loading="lazy" decoding="async" />
          : <span className={s.panel} aria-hidden="true" />}
        {x.type && <span className={s.cardType}>{x.type}</span>}
      </span>
      <span className={s.cardBody}>
        {(length || x.cities.length > 0) && (
          <span className={s.cardMeta}>{[length, x.cities.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</span>
        )}
        <span className={s.cardTitle}>{x.title}</span>
        <span className={s.cardFoot}>
          {x.from
            ? <span>{t(lang, 'from')} <strong>{formatPrice(x.from.amount, x.from.currency, lang)}</strong> <span className={s.cardPer}>{t(lang, 'perPerson')}</span></span>
            : <span className={s.cardPer}>{t(lang, 'priceOnRequest')}</span>}
          <span aria-hidden="true" className={s.cardArrow}>→</span>
        </span>
      </span>
    </a>
  )
}
