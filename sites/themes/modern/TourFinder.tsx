'use client'
// The site's tours as cards, laid out for how many there are (operator,
// 2026-10-29): a catalogue of one to three must look intentional, not empty.
//   1      one wide featured card (picture left, the facts and price right)
//   2–3    large cards that fill the row
//   4–6    a three-column grid; the Tours page adds type chips and a sort
//   7+     the Tours page gets filters (type, place, length), sort and pages
// Every value on a card is the tour's own; the controls only choose which
// cards to show. The server renders the first page with every control at
// rest, so without script the cards are there.

import { useMemo, useState } from 'react'
import { formatPrice } from '../blocks/format'
import { PictureView } from '../blocks/SiteArt'
import type { Picture } from '../../lib/photos'
import { countOf, t, type StringKey } from '../../i18n/strings'
import s from './theme.module.css'

export interface FinderTour {
  title: string
  href: string
  /** The tour's own photo, or the default picture of its first site — never empty. */
  picture: Picture
  days: number | null
  nights: number | null
  hours?: number | null
  cities: string[]
  type?: string | null
  from: { amount: number; currency: string } | null
  highlights?: string[]
  guideLanguages?: string[]
}

type Length = 'half' | 'full' | 'short' | 'long'
type Sort = 'recommended' | 'priceAsc' | 'priceDesc' | 'duration'
const LENGTH_LABEL: Record<Length, StringKey> = { half: 'durHalf', full: 'durFull', short: 'durShort', long: 'durLong' }
const lengthOfDays = (x: FinderTour): Length | null =>
  x.days === null ? null : x.days === 1 ? (x.hours && x.hours <= 5 ? 'half' : 'full') : x.days <= 5 ? 'short' : 'long'
const PAGE = 9

/** Where the list sits: the Tours page gets the controls; elsewhere, cards. */
export function TourFinder({ tours, lang, where, limit }: { tours: FinderTour[]; lang: string; where: 'home' | 'listing' | 'destination'; limit?: number }) {
  const n = tours.length
  if (n === 1) return <FeaturedCard tour={tours[0]} lang={lang} />
  if (n <= 3) return <ul className={s.cardsLarge} data-n={n}>{tours.map(x => <li key={x.href}><TourCard tour={x} lang={lang} size="large" /></li>)}</ul>
  if (where !== 'listing') return <Chips tours={tours} lang={lang} chips={where === 'home' && n >= 7} limit={limit} />
  if (n <= 6) return <Chips tours={tours} lang={lang} chips sort />
  return <Filtered tours={tours} lang={lang} />
}

function sorted(list: FinderTour[], sort: Sort): FinderTour[] {
  // A tour with its price on request sorts after every priced one.
  const price = (x: FinderTour, dir: 1 | -1) => x.from ? x.from.amount * dir : Number.POSITIVE_INFINITY
  return sort === 'recommended' ? list : [...list].sort((a, b) =>
    sort === 'priceAsc' ? price(a, 1) - price(b, 1)
      : sort === 'priceDesc' ? price(a, -1) - price(b, -1)
        : (a.days ?? 99) - (b.days ?? 99) || (a.hours ?? 99) - (b.hours ?? 99))
}

function SortSelect({ sort, onSort, lang }: { sort: Sort; onSort: (v: Sort) => void; lang: string }) {
  return (
    <label className={s.sortLabel}>
      <span>{t(lang, 'sortLabel')}</span>
      <select className={s.select} value={sort} onChange={e => onSort(e.target.value as Sort)}>
        <option value="recommended">{t(lang, 'sortRecommended')}</option>
        <option value="priceAsc">{t(lang, 'sortPriceAsc')}</option>
        <option value="priceDesc">{t(lang, 'sortPriceDesc')}</option>
        <option value="duration">{t(lang, 'sortDuration')}</option>
      </select>
    </label>
  )
}

const countLabel = (lang: string, n: number) => `${n} ${t(lang, n === 1 ? 'oneTourWord' : 'toursWord')}`

/** A grid, with type chips (and a sort) where asked. */
function Chips({ tours, lang, chips, sort: withSort, limit }: { tours: FinderTour[]; lang: string; chips?: boolean; sort?: boolean; limit?: number }) {
  const [type, setType] = useState('')
  const [sort, setSort] = useState<Sort>('recommended')
  const types = useMemo(() => [...new Set(tours.map(x => x.type).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, lang)), [tours, lang])
  const shown = sorted(tours.filter(x => !type || x.type === type), sort).slice(0, limit ?? tours.length)
  const showChips = chips && types.length > 1
  return (
    <div>
      {(showChips || withSort) && (
        <div className={s.listBar}>
          {showChips ? (
            <div className={s.chipRow} role="group" aria-label={t(lang, 'typeLabel')}>
              {['', ...types].map(x => (
                <button key={x || 'all'} type="button" className={s.toggle} aria-pressed={type === x} onClick={() => setType(x)}>{x || t(lang, 'allTypes')}</button>
              ))}
            </div>
          ) : <span />}
          {withSort && (
            <div className={s.finderEnd}>
              <span className={s.countNote}>{countLabel(lang, shown.length)}</span>
              <SortSelect sort={sort} onSort={setSort} lang={lang} />
            </div>
          )}
        </div>
      )}
      <ul className={s.cards}>{shown.map(x => <li key={x.href}><TourCard tour={x} lang={lang} /></li>)}</ul>
    </div>
  )
}

/** The Tours page of a large catalogue: filters beside the cards (a
 *  "Filters" panel on phones), a sort, and pages of nine. */
function Filtered({ tours, lang }: { tours: FinderTour[]; lang: string }) {
  const [type, setType] = useState('')
  const [places, setPlaces] = useState<string[]>([])
  const [lengths, setLengths] = useState<Length[]>([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<Sort>('recommended')
  const [page, setPage] = useState(0)
  const currency = tours.find(x => x.from)?.from?.currency ?? null
  const lo = minPrice === '' ? null : Number(minPrice)
  const hi = maxPrice === '' ? null : Number(maxPrice)
  const types = useMemo(() => [...new Set(tours.map(x => x.type).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, lang)), [tours, lang])
  const allPlaces = useMemo(() => {
    const count = new Map<string, number>()
    for (const x of tours) for (const c of new Set(x.cities)) count.set(c, (count.get(c) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], lang)).map(([c]) => c)
  }, [tours, lang])
  const allLengths = (['half', 'full', 'short', 'long'] as const).filter(l => tours.some(x => lengthOfDays(x) === l))

  const matching = tours.filter(x => (!type || x.type === type)
    && (places.length === 0 || x.cities.some(c => places.includes(c)))
    && (lengths.length === 0 || lengths.includes(lengthOfDays(x)!))
    // A price bound shows only tours with a price inside it (none "on request").
    && (lo === null || (x.from !== null && x.from.amount >= lo))
    && (hi === null || (x.from !== null && x.from.amount <= hi)))
  const ordered = sorted(matching, sort)
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE))
  const at = Math.min(page, pages - 1)
  const shown = ordered.slice(at * PAGE, at * PAGE + PAGE)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const active = type !== '' || places.length > 0 || lengths.length > 0 || lo !== null || hi !== null

  const panel = (
    <>
      {types.length > 1 && (
        <fieldset className={s.filterGroup}>
          <legend>{t(lang, 'filterType')}</legend>
          {['', ...types].map(x => (
            <label key={x || 'all'} className={s.filterOption}>
              <input type="radio" name="tour-type" checked={type === x} onChange={() => { setType(x); setPage(0) }} />
              <span>{x || t(lang, 'allToursFilter')}</span>
              <span className={s.filterCount}>{x ? tours.filter(y => y.type === x).length : tours.length}</span>
            </label>
          ))}
        </fieldset>
      )}
      {allPlaces.length > 1 && (
        <fieldset className={s.filterGroup}>
          <legend>{t(lang, 'filterPlace')}</legend>
          {allPlaces.map(p => (
            <label key={p} className={s.filterOption}>
              <input type="checkbox" checked={places.includes(p)} onChange={() => { setPlaces(toggle(places, p)); setPage(0) }} />
              <span>{p}</span>
            </label>
          ))}
        </fieldset>
      )}
      {allLengths.length > 1 && (
        <fieldset className={s.filterGroup}>
          <legend>{t(lang, 'duration')}</legend>
          {allLengths.map(l => (
            <label key={l} className={s.filterOption}>
              <input type="checkbox" checked={lengths.includes(l)} onChange={() => { setLengths(toggle(lengths, l)); setPage(0) }} />
              <span>{t(lang, LENGTH_LABEL[l])}</span>
            </label>
          ))}
        </fieldset>
      )}
      {currency && (
        <fieldset className={s.filterGroup}>
          <legend>{t(lang, 'priceFilter')}</legend>
          <div className={s.priceRange}>
            <label><span>{t(lang, 'minPrice')} {currencySymbol(currency, lang)}</span>
              <input type="number" min={0} inputMode="numeric" placeholder="0" value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(0) }} /></label>
            <label><span>{t(lang, 'maxPrice')} {currencySymbol(currency, lang)}</span>
              <input type="number" min={0} inputMode="numeric" placeholder={t(lang, 'anyPrice')} value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(0) }} /></label>
          </div>
        </fieldset>
      )}
      {active && <button type="button" className={s.linkButton} onClick={() => { setType(''); setPlaces([]); setLengths([]); setMinPrice(''); setMaxPrice(''); setPage(0) }}>{t(lang, 'clearFilters')}</button>}
    </>
  )

  return (
    <div className={s.filtered}>
      <aside className={s.filterSide} aria-label={t(lang, 'filtersButton')}>{panel}</aside>
      <div className={s.filteredMain}>
        <details className={s.filterSheet}>
          <summary className={s.toggle}>{t(lang, 'filtersButton')}</summary>
          <div className={s.filterSheetBody}>{panel}</div>
        </details>
        <div className={s.listBar}>
          <strong className={s.countStrong}>{countLabel(lang, ordered.length)}</strong>
          <SortSelect sort={sort} onSort={v => { setSort(v); setPage(0) }} lang={lang} />
        </div>
        {shown.length === 0 ? <p className={s.empty}>{t(lang, 'noMatch')}</p> : (
          <ul className={s.cardsTight}>{shown.map(x => <li key={x.href}><TourCard tour={x} lang={lang} /></li>)}</ul>
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
    </div>
  )
}

/** "€" for EUR in this language — the price boxes' label. */
function currencySymbol(currency: string, lang: string): string {
  return new Intl.NumberFormat(lang, { style: 'currency', currency }).formatToParts(0).find(p => p.type === 'currency')?.value ?? currency
}

function lengthOf(x: FinderTour, lang: string): string | null {
  if (x.days === null) return null
  if (x.days === 1 && x.hours) return `${x.hours} ${t(lang, x.hours === 1 ? 'oneHour' : 'hours')}`
  return x.nights ? `${countOf(lang, x.days, 'day')} · ${countOf(lang, x.nights, 'night')}` : countOf(lang, x.days, 'day')
}

function FromPrice({ tour: x, lang, big }: { tour: FinderTour; lang: string; big?: boolean }) {
  return x.from
    ? <span className={big ? s.fromBig : undefined}>{t(lang, 'from')} <strong>{formatPrice(x.from.amount, x.from.currency, lang)}</strong> <span className={s.cardPer}>{t(lang, 'perPerson')}</span></span>
    : <span className={s.cardPer}>{t(lang, 'priceOnRequest')}</span>
}

function Tick() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={s.icon}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
}

/** A catalogue of one: the tour across the full width. */
export function FeaturedCard({ tour: x, lang }: { tour: FinderTour; lang: string }) {
  const meta = [lengthOf(x, lang), x.cities.slice(0, 3).join(', '),
    x.guideLanguages?.length ? `${t(lang, 'guideSpeaks')}: ${x.guideLanguages.join(', ')}` : null].filter(Boolean).join(' · ')
  return (
    <article className={s.featured}>
      <a className={s.featuredMedia} href={x.href} tabIndex={-1} aria-hidden="true">
        <PictureView picture={x.picture} className={s.cardImg} decorative />
        {x.type && <span className={s.cardType}>{x.type}</span>}
      </a>
      <div className={s.featuredBody}>
        {meta && <p className={s.cardMeta}>{meta}</p>}
        <h3 className={s.featuredTitle}><a href={x.href}>{x.title}</a></h3>
        {x.highlights && x.highlights.length > 0 && (
          <ul className={s.featuredList}>{x.highlights.map(h => <li key={h}><Tick />{h}</li>)}</ul>
        )}
        <div className={s.featuredFoot}>
          <FromPrice tour={x} lang={lang} big />
          <a className={s.pillDark} href={x.href}>{t(lang, 'viewTourShort')}</a>
        </div>
      </div>
    </article>
  )
}

export function TourCard({ tour: x, lang, size }: { tour: FinderTour; lang: string; size?: 'large' }) {
  const length = lengthOf(x, lang)
  return (
    <a className={size === 'large' ? `${s.card} ${s.cardLarge}` : s.card} href={x.href}>
      <span className={s.cardMedia}>
        <PictureView picture={x.picture} className={s.cardImg} decorative />
        {x.type && <span className={s.cardType}>{x.type}</span>}
      </span>
      <span className={s.cardBody}>
        {(length || x.cities.length > 0) && (
          <span className={s.cardMeta}>{[length, x.cities.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</span>
        )}
        <span className={s.cardTitle}>{x.title}</span>
        {x.highlights && x.highlights.length > 0 && <span className={s.cardSub}>{x.highlights.join(', ')}</span>}
        <span className={s.cardFoot}>
          <FromPrice tour={x} lang={lang} />
          <span aria-hidden="true" className={s.cardArrow}>→</span>
        </span>
      </span>
    </a>
  )
}
