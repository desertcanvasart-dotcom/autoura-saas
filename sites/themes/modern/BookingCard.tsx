'use client'
// The tour page's sticky card: the one public price for the visitor's group
// (PriceStepper), the day they hope to travel, and the two ways to ask. What
// is chosen here fills the enquiry form below (travellers, date), so nobody
// types it twice. Without script the card still shows the price, and the
// form still asks for both.

import { useEffect, useState } from 'react'
import type { TourFacts } from '@/lib/publish/contract'
import { PriceStepper } from '../blocks/PriceStepper'
import { fill, t } from '../../i18n/strings'
import { formatPrice } from '../blocks/format'
import s from './theme.module.css'

function fillField(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null
  if (el) el.value = value
}

export function BookingCard({ price, lang, whatsapp, trust, runs }: {
  price: TourFacts['price']
  lang: string
  whatsapp: string | null
  /** "Runs Mon, Wed and Fri" — the tour's departure days, under the date. */
  runs?: string | null
  /** The true promises this tour can make (cancellation, payment, licence). */
  trust: Array<{ text: string; licence?: boolean }>
}) {
  const [pax, setPax] = useState<number | null>(null)
  const [date, setDate] = useState('')
  const [today, setToday] = useState<string | undefined>(undefined)
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)) }, [])
  useEffect(() => { if (pax !== null) fillField('enq-travellers', String(pax)) }, [pax])
  useEffect(() => { if (date) fillField('enq-date', date) }, [date])
  // The bar shows the same band the card shows (the fewest travellers until one is chosen).
  const shownPax = pax ?? price.bands[0]?.minPax ?? 1
  const perPerson = price.status === 'available' ? price.bands.find(b => shownPax >= b.minPax && shownPax <= b.maxPax)?.perPerson ?? null : null

  return (
    <div className={s.bookWrap}>
      <div className={s.bookCard} data-section="price">
        <PriceStepper price={price} lang={lang} onPax={setPax} wording="template" />
        {price.status === 'available' && price.tierLabel && (
          <p className={s.option}><strong>{t(lang, 'optionLabel')}: {price.tierLabel}.</strong> {t(lang, 'optionNote')}</p>
        )}
        <label className={s.dateField}>
          <span>{t(lang, 'travelDate')}</span>
          <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} />
          {runs && <span className={s.runs}>{runs}</span>}
        </label>
        <a className={s.pillDark} href="#enquire">{t(lang, 'checkAvailability')}</a>
        {whatsapp && (
          <a className={s.ghost} href={whatsapp} rel="nofollow">
            <svg viewBox="0 0 24 24" aria-hidden="true" className={s.icon}><path d="M5 19l1.2-3.6A7.5 7.5 0 1112 19.5a7.4 7.4 0 01-3.5-.9L5 19z" /></svg>
            {t(lang, 'askOnWhatsApp')}
          </a>
        )}
      </div>
      {trust.length > 0 && (
        <ul className={s.trust}>
          {trust.map(x => (
            <li key={x.text}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {x.licence ? <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}
              </svg>
              {x.text}
            </li>
          ))}
        </ul>
      )}
      {/* Phones: the price for the group and the one button, always in reach. */}
      <div className={s.mobileBar}>
        {perPerson !== null ? (
          <span>
            <strong>{formatPrice(perPerson, price.currency, lang)}</strong>{' '}
            <span className={s.mobileBarNote}>{t(lang, 'perPerson')} · {shownPax === 1 ? t(lang, 'oneTraveller') : fill(lang, 'travellersCount', { n: shownPax })}</span>
          </span>
        ) : <span className={s.mobileBarNote}>{t(lang, 'priceOnRequest')}</span>}
        <a className={s.pillDark} href="#enquire">{t(lang, 'checkAvailability')}</a>
      </div>
    </div>
  )
}
