'use client'
// The tour page's sticky card: the one public price for the visitor's group
// (PriceStepper), the day they hope to travel, and the two ways to ask. What
// is chosen here fills the enquiry form below (travellers, date), so nobody
// types it twice. Without script the card still shows the price, and the
// form still asks for both.

import { useEffect, useState } from 'react'
import type { TourFacts } from '@/lib/publish/contract'
import { PriceStepper } from '../blocks/PriceStepper'
import { t } from '../../i18n/strings'
import s from './theme.module.css'

function fill(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null
  if (el) el.value = value
}

export function BookingCard({ price, lang, whatsapp, trust }: {
  price: TourFacts['price']
  lang: string
  whatsapp: string | null
  /** The true promises this tour can make (cancellation, payment, licence). */
  trust: string[]
}) {
  const [pax, setPax] = useState<number | null>(null)
  const [date, setDate] = useState('')
  const [today, setToday] = useState<string | undefined>(undefined)
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)) }, [])
  useEffect(() => { if (pax !== null) fill('enq-travellers', String(pax)) }, [pax])
  useEffect(() => { if (date) fill('enq-date', date) }, [date])

  return (
    <div className={s.bookCard} data-section="price">
      <PriceStepper price={price} lang={lang} onPax={setPax} />
      {price.status === 'available' && price.tierLabel && (
        <p className={s.option}><strong>{t(lang, 'optionLabel')}: {price.tierLabel}.</strong> {t(lang, 'optionNote')}</p>
      )}
      <label className={s.dateField}>
        <span>{t(lang, 'travelDate')}</span>
        <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} />
      </label>
      <a className={s.pillDark} href="#enquire">{t(lang, 'enquireGeneral')}</a>
      {whatsapp && <a className={s.ghost} href={whatsapp} rel="nofollow">{t(lang, 'askOnWhatsApp')}</a>}
      {trust.length > 0 && (
        <ul className={s.trust}>
          {trust.map(x => (
            <li key={x}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
