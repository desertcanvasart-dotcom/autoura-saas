// ============================================
// A tour page's fact sections — every figure straight from the payload
// ============================================
// docs/publish/PLAN.md §8. Each section renders the facts the GetAutoura app
// read from the records, and renders NOTHING when they are absent: no
// placeholder, no default ("daily"), no free-cancellation it was not told.
// Themes choose the order (tourSections) and the look (variant); the words
// and figures are the same for every theme.

import type { PageNarrative, TourFacts } from '@/lib/publish/contract'
import { narrativeText, paragraphs } from './narrative'
import { colon, countOf, t } from '../../i18n/strings'
import { formatDate, formatPercent, formatWeekdays } from './format'
import { PriceStepper } from './PriceStepper'
import s from './facts.module.css'

export type FactsVariant = 'editorial' | 'compact'
type P = { facts: TourFacts; lang: string; variant: FactsVariant; narrative?: PageNarrative | null }

/** The approved overview, slots filled; nothing when there is none. */
export function OverviewSection({ facts, lang, variant, narrative }: P) {
  const text = narrativeText(narrative?.overview, facts, lang)
  if (!text) return null
  return (
    <section className={cx(variant, 'section', 'overview')}>
      {paragraphs(text).map((p, i) => <p key={i}>{p}</p>)}
    </section>
  )
}

const cx = (variant: FactsVariant, ...names: string[]) => [...names.map(n => s[n]), s[variant]].filter(Boolean).join(' ')

export function PriceSection({ facts, lang, variant }: P) {
  return (
    <section className={cx(variant, 'price')}>
      <PriceStepper price={facts.price} lang={lang} />
    </section>
  )
}

export function HighlightsSection({ facts, lang, variant, narrative }: P) {
  // Approved highlight lines first; the records' own list when there are none.
  const written = (narrative?.highlights ?? []).map(i => narrativeText(i, facts, lang)).filter((x): x is string => !!x)
  if (written.length) {
    return (
      <section className={cx(variant, 'section')}>
        <h2>{t(lang, 'highlights')}</h2>
        <ul className={s.list}>{written.map(w => <li key={w}>{w}</li>)}</ul>
      </section>
    )
  }
  const items = [...new Set([...facts.highlights, ...facts.mainAttractions])]
  if (items.length === 0) return null
  return (
    <section className={cx(variant, 'section')}>
      <h2>{t(lang, 'highlights')}</h2>
      <ul className={s.chips}>{items.map(i => <li key={i}>{i}</li>)}</ul>
    </section>
  )
}

export function ItinerarySection({ facts, lang, variant, narrative }: P) {
  if (facts.days.length === 0) return null
  const dayText = new Map((narrative?.days ?? []).map(d => [d.day, narrativeText(d.segments, facts, lang)]))
  return (
    <section className={cx(variant, 'section')}>
      <h2>{t(lang, 'itinerary')}</h2>
      <p className={s.note}>{countOf(lang, facts.durationDays, 'day')}{facts.durationNights > 0 ? ` · ${countOf(lang, facts.durationNights, 'night')}` : ''}</p>
      <ol className={s.days}>
        {facts.days.map(d => {
          const meals = (['breakfast', 'lunch', 'dinner'] as const).filter(m => d.meals[m])
          return (
            <li key={d.day} className={s.dayItem}>
              <h3><span className={s.dayNo}>{t(lang, 'day')} {d.day}</span>{d.title ? ` — ${d.title}` : d.city ? ` — ${d.city}` : ''}</h3>
              {paragraphs(dayText.get(d.day) ?? null).map((p, i) => <p key={i} className={s.dayText}>{p}</p>)}
              {d.sights.length > 0 && <p><span className={s.label}>{t(lang, 'sights')}{colon(lang)}</span> {d.sights.join(', ')}</p>}
              {meals.length > 0 && <p><span className={s.label}>{meals.map(m => t(lang, m)).join(' · ')}</span></p>}
              {d.overnight && d.city && <p className={s.note}>{t(lang, 'overnightIn')} {d.city}</p>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function AccommodationSection({ facts, lang, variant }: P) {
  if (facts.accommodation.length === 0) return null
  return (
    <section className={cx(variant, 'section')}>
      <h2>{t(lang, 'whereYouStay')}</h2>
      <ul className={s.list}>
        {facts.accommodation.map(a => (
          <li key={`${a.kind}:${a.name}:${a.city ?? ''}`}>
            {a.kind === 'cruise' ? `${t(lang, 'nileCruise')}${colon(lang)} ${a.name}` : a.city ? `${a.name}, ${a.city}` : a.name}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function InclusionsSection({ facts, lang, variant }: P) {
  if (facts.inclusions.length === 0 && facts.exclusions.length === 0) return null
  return (
    <section className={cx(variant, 'section', 'inclusions')}>
      {facts.inclusions.length > 0 && (
        <div>
          <h2>{t(lang, 'included')}</h2>
          <ul className={s.yes}>{facts.inclusions.map(i => <li key={i}>{i}</li>)}</ul>
        </div>
      )}
      {facts.exclusions.length > 0 && (
        <div>
          <h2>{t(lang, 'notIncluded')}</h2>
          <ul className={s.no}>{facts.exclusions.map(i => <li key={i}>{i}</li>)}</ul>
        </div>
      )}
    </section>
  )
}

export function GroupSizeSection({ facts, lang, variant }: P) {
  const g = facts.groupSize
  if (!g || (g.min === null && g.max === null)) return null
  const text = g.min !== null && g.max !== null
    ? (g.min === g.max ? `${g.min}` : `${g.min}–${g.max}`)
    : g.max !== null ? `${t(lang, 'upTo')} ${g.max}` : `${g.min}+`
  return (
    <section className={cx(variant, 'section', 'fact')}>
      <h2>{t(lang, 'groupSize')}</h2>
      <p>{text} {t(lang, 'travellers')}</p>
    </section>
  )
}

export function DeparturesSection({ facts, lang, variant }: P) {
  if (facts.departureDays.length === 0 && facts.departures.length === 0) return null
  return (
    <section className={cx(variant, 'section')}>
      {facts.departureDays.length > 0 && (
        <p><span className={s.label}>{t(lang, 'departs')}{colon(lang)}</span> {formatWeekdays(facts.departureDays, lang)}</p>
      )}
      {facts.departures.length > 0 && (
        <>
          <h2>{t(lang, 'upcomingDepartures')}</h2>
          <ul className={s.list}>
            {facts.departures.map(d => (
              <li key={d.date}>
                {formatDate(d.date, lang)}{d.endDate ? ` – ${formatDate(d.endDate, lang)}` : ''}
                {d.status === 'full' ? ` · ${t(lang, 'full')}` : (
                  <>
                    {d.status === 'guaranteed' && ` · ${t(lang, 'guaranteed')}`}
                    {d.seatsLeft !== null && ` · ${d.seatsLeft} ${t(lang, 'seatsLeft')}`}
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export function CancellationSection({ facts, lang, variant }: P) {
  const c = facts.cancellation
  if (!c) return null
  return (
    <section className={cx(variant, 'section')}>
      <h2>{t(lang, 'cancellation')}</h2>
      {c.tiers.length > 0 && (
        <ul className={s.list}>
          {c.tiers.map(tier => (
            <li key={tier.daysBefore}>
              {tier.daysBefore === 0 ? t(lang, 'onDeparture') : `${tier.daysBefore} ${t(lang, 'daysBeforeDeparture')}`}{colon(lang)} {formatPercent(tier.chargePercent, lang)} {t(lang, 'cancellationCharge')}
            </li>
          ))}
        </ul>
      )}
      {c.wording && <p className={s.wording}>{c.wording}</p>}
    </section>
  )
}

export function TourImage({ facts, alt, className }: { facts: TourFacts; alt: string; className?: string }) {
  const src = facts.images[0]
  if (!src) return null
  // The first image is the page's largest paint: loaded at once, sized by CSS
  // (aspect-ratio) so nothing shifts while it arrives.
  // eslint-disable-next-line @next/next/no-img-element -- the company's own storage; no image optimiser between
  return <img src={src} alt={alt} className={className} fetchPriority="high" decoding="async" width={1200} height={675} />
}
