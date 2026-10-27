// ============================================
// Archetype: Modern (redesign, operator 2026-10-27)
// ============================================
// Modern and sleek, photo-led, built for any agency's palette — never a
// default of gold or beige. One strong brand colour carries the hero (a
// full-bleed band with slanted photo strips, after the reference the
// operator chose), white everywhere else, the accent for small moments.
//
// The tour page: a photo hero, a price card that stays in view, the route on
// a map of Egypt, the days as an opening timeline, what is and is not
// included as two checked lists, and the enquiry form. Every fact is the
// records'; every sentence of narrative is approved text; pictures come from
// the agency first, then the library (sites/lib/photos.ts).

import type { Theme, ThemePageProps } from '../types'
import type { PageNarrative, TourFacts } from '@/lib/publish/contract'
import { BrandMark } from '../blocks/BrandMark'
import { LanguageLinks } from '../blocks/LanguageLinks'
import { EnquiryForm } from '../blocks/EnquiryForm'
import { CancellationSection, DeparturesSection, PriceSection } from '../blocks/TourFacts'
import { emailHref, phoneHref, whatsappHref } from '../blocks/contact'
import { narrativeText, paragraphs } from '../blocks/narrative'
import { formatWeekdays } from '../blocks/format'
import { colon, countOf, t } from '../../i18n/strings'
import { photoFor, tourPhotos, type Photo } from '../../lib/photos'
import { PriceExplorer } from './PriceExplorer'
import { RouteMap } from './RouteMap'
import { TourFinder, type FinderTour } from './TourFinder'
import s from './theme.module.css'

/* eslint-disable @next/next/no-img-element -- remote library and agency storage; sized by CSS */

function Img({ photo, className, eager }: { photo: Photo; className?: string; eager?: boolean }) {
  return <img src={photo.src} alt={photo.alt} className={className} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" />
}

function Frame({ page, preview, children }: ThemePageProps & { children: React.ReactNode }) {
  const lang = page.language
  const { identity, companyName } = page.site
  const wa = whatsappHref(page)
  const email = emailHref(identity)
  const phone = phoneHref(identity)
  const onBand = page.kind === 'home' || page.kind === 'tour' || page.kind === 'destination'
  return (
    <div className={s.page}>
      {preview && <div className={s.preview}>{t(lang, 'previewBanner')}</div>}
      <header className={`${s.header} ${onBand ? s.headerOnBand : ''}`}>
        <BrandMark page={page} className={s.brand} />
        <nav className={s.nav} aria-label={companyName}>
          <a href={`/${lang}/tours`}>{t(lang, 'journeysTitle')}</a>
          <LanguageLinks page={page} className={s.languages} />
          <a className={s.navCta} href={page.kind === 'tour' ? '#enquire' : wa ?? email ?? `/${lang}/tours`}>{t(lang, 'planYourJourney')}</a>
        </nav>
      </header>
      <main className={s.main}>{children}</main>
      <footer className={s.footer}>
        <div className={s.container}>
          <div className={s.footerGrid}>
            <div>
              <p className={s.footerName}>{companyName}</p>
              {identity.tagline && <p className={s.footerTagline}>{identity.tagline}</p>}
            </div>
            <ul className={s.footerContact}>
              {email && <li><a href={email}>{identity.email}</a></li>}
              {phone && <li><a href={phone}>{identity.phone}</a></li>}
              {wa && <li><a href={wa} rel="nofollow">WhatsApp</a></li>}
              {identity.address && <li>{identity.address}</li>}
            </ul>
          </div>
          {identity.licenseNumber && <p className={s.licence}>{t(lang, 'licensed')} {identity.licenseNumber}</p>}
        </div>
      </footer>
    </div>
  )
}

/** The page's tours as finder cards: the agency's own photo first, else the library's. */
function finderTours(page: ThemePageProps['page']): FinderTour[] {
  return page.tours.map(tour => {
    const c = tour.card
    const photo = c?.image ? { src: c.image, alt: tour.title } : tourPhotos({ name: tour.title, cities: c?.cities ?? [] })[0] ?? null
    return {
      title: tour.title, href: `/${page.language}/${tour.path}`, photo: photo ? { src: photo.src, alt: photo.alt } : null,
      days: c?.days ?? null, nights: c?.nights ?? null, cities: c?.cities ?? [], from: c?.from ?? null,
    }
  })
}

function TourCards({ page, filters = true }: ThemePageProps & { filters?: boolean }) {
  if (page.tours.length === 0) return <p className={s.empty}>{t(page.language, 'noToursYet')}</p>
  return <TourFinder tours={finderTours(page)} lang={page.language} filters={filters} />
}

/** The places the tours go, as photo tiles — each a page of its own. */
function Destinations({ page }: ThemePageProps) {
  const lang = page.language
  const list = (page.destinations ?? []).filter(d => d.path !== `destinations/${page.destination?.slug}`).slice(0, 8)
  if (list.length === 0) return null
  return (
    <section className={`${s.container} ${s.section}`}>
      <h2 className={s.h2Big}>{t(lang, 'destinationsTitle')}</h2>
      <ul className={s.places}>
        {list.map(d => {
          const photo = photoFor(d.name) ?? tourPhotos({ name: d.name })[0] ?? null
          return (
            <li key={d.path}>
              <a className={s.place} href={`/${lang}/${d.path}`}>
                {photo ? <Img photo={photo} className={s.placeImg} /> : <span className={s.panel} aria-hidden="true" />}
                <span className={s.cardShade} aria-hidden="true" />
                <span className={s.placeBody}>
                  <span className={s.placeName}>{d.name}</span>
                  <span className={s.cardMore}>{d.count} {t(lang, d.count === 1 ? 'oneJourney' : 'journeysCount')}</span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The home band: one brand colour, a bold line, slanted photo strips. */
function HomeHero({ page }: ThemePageProps) {
  const lang = page.language
  const { identity, companyName } = page.site
  const strips = page.tours.map(x => photoFor(x.title)).filter((p): p is Photo => p !== null)
  const pics = [...new Map([...strips, ...tourPhotos({ name: 'giza pyramids nile luxor' })].map(p => [p.src, p])).values()].slice(0, 3)
  return (
    <section className={s.band}>
      <div className={`${s.container} ${s.bandInner}`}>
        <div className={s.bandText}>
          <p className={s.eyebrow}>{companyName}</p>
          <h1 className={s.bandTitle}>{identity.tagline ?? companyName}</h1>
          <a className={s.pill} href={`/${lang}/tours`}>{t(lang, 'journeysTitle')} <span aria-hidden="true">→</span></a>
        </div>
        <div className={s.strips} aria-hidden="true">
          {/* No photos (library off, none of the agency's): the strips are colour. */}
          {(pics.length ? pics : [null, null, null]).map((p, i) => (
            <div key={p?.src ?? i} className={s.strip} style={{ '--i': i } as React.CSSProperties}>
              {p ? <Img photo={p} eager={i === 0} /> : <span className={s.stripPanel} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Chips({ facts, lang }: { facts: TourFacts; lang: string }) {
  const cities = [...new Set(facts.days.map(d => d.city).filter((c): c is string => !!c))]
  const g = facts.groupSize
  return (
    <ul className={s.chips} data-section="groupSize">
      <li>{facts.durationNights > 0 ? `${countOf(lang, facts.durationDays, 'day')} · ${countOf(lang, facts.durationNights, 'night')}` : countOf(lang, facts.durationDays, 'day')}</li>
      {cities.length > 0 && <li>{cities.join(' · ')}</li>}
      {g && g.max !== null && <li>{g.min !== null && g.min !== g.max ? `${g.min}–${g.max}` : `${t(lang, 'upTo')} ${g.max}`} {t(lang, 'travellers')}</li>}
      {facts.departureDays.length > 0 && <li>{t(lang, 'departs')}{colon(lang)} {formatWeekdays(facts.departureDays, lang)}</li>}
    </ul>
  )
}

function Timeline({ facts, lang, narrative }: { facts: TourFacts; lang: string; narrative: PageNarrative | null }) {
  if (facts.days.length === 0) return null
  const text = new Map((narrative?.days ?? []).map(d => [d.day, narrativeText(d.segments, facts, lang)]))
  return (
    <ol className={s.timeline}>
      {facts.days.map((d, i) => {
        const photo = photoFor(d.sights[0]) ?? photoFor(d.title) ?? photoFor(d.city)
        const meals = (['breakfast', 'lunch', 'dinner'] as const).filter(m => d.meals[m])
        return (
          <li key={d.day} className={s.day}>
            <details open={i === 0}>
              <summary>
                <span className={s.dayNo}>{t(lang, 'day')} {d.day}</span>
                <span className={s.dayTitle}>{d.title ?? d.city ?? ''}</span>
              </summary>
              <div className={s.dayBody}>
                {photo && <Img photo={photo} className={s.dayImg} />}
                <div>
                  {text.get(d.day) && paragraphs(text.get(d.day)!).map((p, j) => <p key={j}>{p}</p>)}
                  {d.sights.length > 0 && <p><strong>{t(lang, 'sights')}{colon(lang)}</strong> {d.sights.join(', ')}</p>}
                  {meals.length > 0 && <p className={s.muted}>{meals.map(m => t(lang, m)).join(' · ')}</p>}
                  {d.overnight && d.city && <p className={s.muted}>{t(lang, 'overnightIn')} {d.city}</p>}
                </div>
              </div>
            </details>
          </li>
        )
      })}
    </ol>
  )
}

function Ticks({ items, kind }: { items: string[]; kind: 'yes' | 'no' }) {
  return (
    <ul className={s.ticks}>
      {items.map(item => (
        <li key={item}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className={kind === 'yes' ? s.tickYes : s.tickNo}>
            {kind === 'yes' ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M7 7l10 10M17 7L7 17" />}
          </svg>
          {item}
        </li>
      ))}
    </ul>
  )
}

function TourPage({ page }: ThemePageProps) {
  const lang = page.language
  const tour = page.tour!
  const facts = tour.facts
  const narrative = tour.narrative
  const photos = tourPhotos({ name: tour.name, images: facts?.images, sights: facts?.days.flatMap(d => d.sights), cities: facts?.days.map(d => d.city) })
  const overview = narrativeText(narrative?.overview, facts, lang)
  const highlights = (narrative?.highlights ?? []).map(h => narrativeText(h, facts, lang)).filter((h): h is string => !!h)
  const recordHighlights = highlights.length ? highlights : facts?.highlights ?? []
  return (
    <article>
      <section className={s.tourHero} data-section="hero">
        {photos[0] && <Img photo={photos[0]} className={s.tourHeroImg} eager />}
        <div className={s.tourHeroShade} aria-hidden="true" />
        <div className={`${s.container} ${s.tourHeroText}`}>
          {page.unpublished && <p className={s.unpublished}>{t(lang, 'notYetPublished')}</p>}
          <a className={s.crumb} href={`/${lang}/tours`}>← {t(lang, 'allTours')}</a>
          <h1 className={s.tourTitle}>{tour.name}</h1>
          {facts && <Chips facts={facts} lang={lang} />}
        </div>
      </section>

      <div className={`${s.container} ${s.tourGrid}`}>
        <div className={s.tourMain}>
          {overview && (
            <section className={s.block} data-section="overview">
              {paragraphs(overview).map((p, i) => <p key={i} className={i === 0 ? s.lead : undefined}>{p}</p>)}
            </section>
          )}
          {recordHighlights.length > 0 && (
            <section className={s.block} data-section="highlights">
              <h2 className={s.h2}>{t(lang, 'highlights')}</h2>
              <ul className={s.highlights}>{recordHighlights.map(h => <li key={h}>{h}</li>)}</ul>
            </section>
          )}
          {photos.length > 1 && (
            <section className={s.gallery} aria-label={tour.name}>
              {photos.slice(1, 5).map(p => <Img key={p.src} photo={p} className={s.galleryImg} />)}
            </section>
          )}
          {facts && (
            <section className={s.block} data-section="itinerary">
              <h2 className={s.h2}>{t(lang, 'itinerary')}</h2>
              <div className={s.routeWrap}>
                <RouteMap facts={facts} label={t(lang, 'itinerary')} className={s.map} />
                <Timeline facts={facts} lang={lang} narrative={narrative} />
              </div>
            </section>
          )}
          {facts && (facts.inclusions.length > 0 || facts.exclusions.length > 0) && (
            <section className={`${s.block} ${s.twoCol}`} data-section="inclusions">
              {facts.inclusions.length > 0 && <div><h2 className={s.h2}>{t(lang, 'included')}</h2><Ticks items={facts.inclusions} kind="yes" /></div>}
              {facts.exclusions.length > 0 && <div><h2 className={s.h2}>{t(lang, 'notIncluded')}</h2><Ticks items={facts.exclusions} kind="no" /></div>}
            </section>
          )}
          {facts && facts.accommodation.length > 0 && (
            <section className={s.block} data-section="accommodation">
              <h2 className={s.h2}>{t(lang, 'whereYouStay')}</h2>
              <ul className={s.stays}>{facts.accommodation.map(a => <li key={`${a.kind}-${a.name}`}>{a.kind === 'cruise' ? `${t(lang, 'nileCruise')}${colon(lang)} ${a.name}` : a.city ? `${a.name}, ${a.city}` : a.name}</li>)}</ul>
            </section>
          )}
          {/* Every price in full — both nationalities, each group size, the
              basis — readable without script; the card beside it is the quick view. */}
          {facts && <div className={s.block} data-section="price"><PriceSection facts={facts} lang={lang} variant="compact" /></div>}
          {facts && <div className={s.block} data-section="departures"><DeparturesSection facts={facts} lang={lang} variant="compact" /></div>}
          {facts && <div className={s.block} data-section="terms"><CancellationSection facts={facts} lang={lang} variant="compact" /></div>}
          <div className={s.block} data-section="enquiry"><EnquiryForm page={page} variant="compact" /></div>
        </div>
        {facts && (
          <aside className={s.side}>
            <div className={s.sticky}>
              <PriceExplorer price={facts.price} lang={lang} />
              <a className={s.pillDark} href="#enquire">{t(lang, 'enquireGeneral')}</a>
              {whatsappHref(page) && <a className={s.ghost} href={whatsappHref(page)!} rel="nofollow">{t(lang, 'askOnWhatsApp')}</a>}
            </div>
          </aside>
        )}
      </div>
    </article>
  )
}

function Page(props: ThemePageProps) {
  const { page } = props
  const lang = page.language
  if (page.kind === 'home') {
    return (
      <>
        <HomeHero {...props} />
        <section className={`${s.container} ${s.section}`}>
          <h2 className={s.h2Big}>{t(lang, 'findJourney')}</h2>
          <TourCards {...props} />
        </section>
        <Destinations {...props} />
      </>
    )
  }
  if (page.kind === 'listing') {
    return (
      <>
        <section className={`${s.container} ${s.section} ${s.listingTop}`}>
          <h1 className={s.h2Big}>{t(lang, 'journeysTitle')}</h1>
          <TourCards {...props} />
        </section>
        <Destinations {...props} />
      </>
    )
  }
  if (page.kind === 'destination' && page.destination) {
    const photo = photoFor(page.destination.name) ?? tourPhotos({ name: page.destination.name })[0] ?? null
    return (
      <>
        <section className={s.tourHero} data-section="hero">
          {photo && <Img photo={photo} className={s.tourHeroImg} eager />}
          <div className={s.tourHeroShade} aria-hidden="true" />
          <div className={`${s.container} ${s.tourHeroText}`}>
            <p className={s.eyebrow}>{t(lang, 'destinationLabel')}</p>
            <h1 className={s.tourTitle}>{page.destination.name}</h1>
          </div>
        </section>
        <section className={`${s.container} ${s.section}`}>
          <h2 className={s.h2Big}>{t(lang, 'toursThere')}</h2>
          <TourCards {...props} filters={false} />
        </section>
        <Destinations {...props} />
      </>
    )
  }
  if (page.kind === 'tour' && page.tour) return <TourPage {...props} />
  return (
    <section className={`${s.container} ${s.section} ${s.listingTop}`}>
      <h1 className={s.h2Big}>{page.title}</h1>
      {page.kind === 'contact' && <EnquiryForm page={page} variant="compact" />}
    </section>
  )
}

export const modern: Theme = {
  archetype: 'modern',
  label: 'Modern',
  description: 'Sleek and photo-led for any palette: a bold colour hero, a route map, a day-by-day timeline and a price for your group.',
  // The order the page draws its sections in (TourPage); the price card
  // beside them is a quick view of the 'price' section, not a second one.
  tourSections: ['hero', 'groupSize', 'overview', 'highlights', 'itinerary', 'inclusions', 'accommodation', 'price', 'departures', 'terms', 'enquiry'],
  Frame,
  Page,
}
