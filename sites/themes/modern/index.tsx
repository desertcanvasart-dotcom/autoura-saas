// ============================================
// Archetype: Modern — the website template (operator brief 2026-10-28)
// ============================================
// Clean and photo-led, for any agency's palette — never a default of gold or
// beige. A white header with the language menu; every page ends in a footer
// that says who the visitor is dealing with (registered company, licence,
// address, WhatsApp, terms, privacy, cookies).
//
// The tour page, top to bottom: breadcrumb → title and rating → gallery →
// key facts → the story, highlights, itinerary (an open timeline for a day
// tour; days to open for a longer one; a map only when it goes to more than
// one place), what is included, where it sleeps, pickup, cancellation as one
// row of cells, departures, reviews, questions, the enquiry form → related
// tours. Beside it, a sticky card with the one public price for the group.
//
// Every fact is the records'; every sentence of narrative is approved text;
// a section with nothing to say is not drawn.

import type { Theme, ThemePageProps } from '../types'
import type { PageNarrative, PagePayload, TourFacts } from '@/lib/publish/contract'
import { BrandMark } from '../blocks/BrandMark'
import { LanguageMenu } from '../blocks/LanguageMenu'
import { EnquiryForm } from '../blocks/EnquiryForm'
import { Reviews } from '../blocks/Reviews'
import { DeparturesSection } from '../blocks/TourFacts'
import { agencyWebsite, emailHref, phoneHref, whatsappHref } from '../blocks/contact'
import { cancellationCells, cancellationHeadline } from '../blocks/cancellation'
import { narrativeText, paragraphs } from '../blocks/narrative'
import { colon, countOf, t } from '../../i18n/strings'
import { photoFor, tourPhotos, type Photo } from '../../lib/photos'
import { RouteMap } from './RouteMap'
import { BookingCard } from './BookingCard'
import { TourCard, TourFinder, type FinderTour } from './TourFinder'
import s from './theme.module.css'

/* eslint-disable @next/next/no-img-element -- remote library and agency storage; sized by CSS */

const AUTOURA = 'https://getautoura.net'

function Img({ photo, className, eager }: { photo: Photo; className?: string; eager?: boolean }) {
  return <img src={photo.src} alt={photo.alt} className={className} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" />
}

function Check() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={s.icon}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
}

// ---------- frame ----------

function Frame({ page, preview, children }: ThemePageProps & { children: React.ReactNode }) {
  const lang = page.language
  const { identity, companyName } = page.site
  const wa = whatsappHref(page)
  const email = emailHref(identity)
  const phone = phoneHref(identity)
  const site = agencyWebsite(page)
  return (
    <div className={s.page}>
      {preview && <div className={s.preview}>{t(lang, 'previewBanner')}</div>}
      <header className={s.headerBar}>
        <div className={`${s.container} ${s.header}`}>
          <BrandMark page={page} className={s.brand} />
          <nav className={s.nav} aria-label={companyName}>
            {site && <a className={s.navHide} href={site.href}>← {site.label}</a>}
            <a href={`/${lang}/tours`}>{t(lang, 'tours')}</a>
            <LanguageMenu page={page} className={s.langMenu} listClassName={s.langList} />
            <a className={s.navCta} href={page.kind === 'tour' ? '#enquire' : wa ?? email ?? `/${lang}/tours`}>{t(lang, 'planYourJourney')}</a>
          </nav>
        </div>
      </header>
      <main className={s.main}>{children}</main>
      <footer className={s.footer}>
        <div className={s.container}>
          <div className={s.footerGrid}>
            <div>
              <p className={s.footerName}>{companyName}</p>
              {identity.tagline && <p className={s.footerTagline}>{identity.tagline}</p>}
            </div>
            <ul className={s.footerList}>
              {wa && <li><a href={wa} rel="nofollow">WhatsApp{identity.whatsapp ? ` ${identity.whatsapp}` : ''}</a></li>}
              {email && <li><a href={email}>{identity.email}</a></li>}
              {phone && <li><a href={phone}>{identity.phone}</a></li>}
              {identity.address && <li>{identity.address}</li>}
            </ul>
            <ul className={s.footerList}>
              <li><a href={`/${lang}/tours`}>{t(lang, 'tours')}</a></li>
              {identity.termsUrl && <li><a href={identity.termsUrl}>{t(lang, 'bookingTerms')}</a></li>}
              {identity.privacyUrl && <li><a href={identity.privacyUrl}>{t(lang, 'privacy')}</a></li>}
              <li><button type="button" className={s.linkButton} popoverTarget="cookie-settings">{t(lang, 'cookieSettings')}</button></li>
            </ul>
          </div>
          <div className={s.footerLegal}>
            <p>
              © {identity.legalEntity ?? companyName}
              {identity.licenseNumber && <> · {t(lang, 'licensed')} {identity.licenseNumber}</>}
            </p>
            <p>{t(lang, 'websiteBy')} <a href={AUTOURA} rel="noopener">Autoura</a></p>
          </div>
        </div>
        {/* The site sets no cookies: the "settings" are that statement. */}
        <div id="cookie-settings" popover="auto" className={s.popover}>
          <p className={s.popoverTitle}>{t(lang, 'cookieSettings')}</p>
          <p>{t(lang, 'cookieText')}</p>
          <button type="button" className={s.pillDark} popoverTarget="cookie-settings" popoverTargetAction="hide">{t(lang, 'close')}</button>
        </div>
      </footer>
    </div>
  )
}

// ---------- shared pieces ----------

/** The page's tours as cards: the agency's own photo first, else the library's. */
function finderTours(list: PagePayload['tours'], lang: string): FinderTour[] {
  return list.map(tour => {
    const c = tour.card
    const photo = c?.image ? { src: c.image, alt: tour.title } : tourPhotos({ name: tour.title, cities: c?.cities ?? [] })[0] ?? null
    return {
      title: tour.title, href: `/${lang}/${tour.path}`, photo: photo ? { src: photo.src, alt: photo.alt } : null,
      days: c?.days ?? null, nights: c?.nights ?? null, hours: c?.hours ?? null, cities: c?.cities ?? [], type: c?.type ?? null, from: c?.from ?? null,
    }
  })
}

/** "4.8 ★★★★★ · 312 reviews on Google" — only when Google gave a rating. */
function RatingLine({ page, className }: { page: PagePayload; className?: string }) {
  const r = page.reviews
  if (!r || r.rating === null) return null
  const lang = page.language
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  return (
    <p className={className ?? s.rating}>
      <strong>{nf.format(r.rating)}</strong>
      <span className={s.stars} role="img" aria-label={`${nf.format(r.rating)} / 5`}>{'★'.repeat(Math.round(r.rating))}</span>
      {r.count !== null && <span>· {new Intl.NumberFormat(lang).format(r.count)} {t(lang, 'reviewsOnGoogle')}</span>}
    </p>
  )
}

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
                <span className={s.placeShade} aria-hidden="true" />
                <span className={s.placeBody}>
                  <span className={s.placeName}>{d.name}</span>
                  <span className={s.placeCount}>{d.count} {t(lang, d.count === 1 ? 'oneJourney' : 'journeysCount')}</span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** What the agency can truly promise: its own claims, the one-price rule,
 *  free enquiries and its licence. Nothing here is invented for it. */
function whyItems(page: PagePayload): Array<{ title: string; text: string | null }> {
  const lang = page.language
  const claims = Array.isArray(page.site.brand.claims) ? (page.site.brand.claims as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim() !== '') : []
  const items: Array<{ title: string; text: string | null }> = claims.slice(0, 3).map(c => ({ title: c, text: null }))
  if (page.tours.some(x => x.card?.from)) items.push({ title: t(lang, 'whyOnePrice'), text: t(lang, 'whyOnePriceText') })
  items.push({ title: t(lang, 'trustNoPayment'), text: t(lang, 'whyNoPaymentText') })
  if (page.site.identity.licenseNumber) items.push({ title: t(lang, 'trustLicensed'), text: `${t(lang, 'whyLicensedText')} ${page.site.identity.licenseNumber}` })
  return items.slice(0, 4)
}

function WhyUs({ page }: { page: PagePayload }) {
  const items = whyItems(page)
  return (
    <section className={`${s.container} ${s.section}`} data-section="why">
      <h2 className={s.h2Big}>{t(page.language, 'whyTitle')}</h2>
      <ul className={s.why}>
        {items.map(x => (
          <li key={x.title}>
            <span className={s.whyIcon}><Check /></span>
            <span className={s.whyTitle}>{x.title}</span>
            {x.text && <span className={s.whyText}>{x.text}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function HowItWorks({ lang }: { lang: string }) {
  const steps = [['how1', 'how1Text'], ['how2', 'how2Text'], ['how3', 'how3Text']] as const
  return (
    <section className={s.soft} data-section="how">
      <div className={`${s.container} ${s.section}`}>
        <h2 className={s.h2Big}>{t(lang, 'howTitle')}</h2>
        <ol className={s.how}>
          {steps.map(([title, text]) => (
            <li key={title}>
              <span className={s.howNo} aria-hidden="true" />
              <span className={s.whyTitle}>{t(lang, title)}</span>
              <span className={s.whyText}>{t(lang, text)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CtaBand({ page }: { page: PagePayload }) {
  const lang = page.language
  const wa = whatsappHref(page)
  return (
    <section className={`${s.container} ${s.section}`}>
      <div className={s.cta}>
        <div>
          <h2 className={s.ctaTitle}>{t(lang, 'ctaTitle')}</h2>
          <p className={s.ctaText}>{t(lang, 'ctaText')}</p>
        </div>
        <div className={s.ctaActions}>
          <a className={s.pill} href={`/${lang}/contact`}>{t(lang, 'enquireGeneral')}</a>
          {wa && <a className={s.pillGhostLight} href={wa} rel="nofollow">{t(lang, 'askOnWhatsApp')}</a>}
        </div>
      </div>
    </section>
  )
}

// ---------- home ----------

function HomeHero({ page }: ThemePageProps) {
  const lang = page.language
  const { identity, companyName } = page.site
  const wa = whatsappHref(page)
  const places = [...new Set(page.tours.flatMap(x => x.card?.cities ?? []))].slice(0, 4)
  const placeList = places.length > 1 ? `${places.slice(0, -1).join(', ')} ${t(lang, 'and')} ${places[places.length - 1]}` : places[0]
  const photo = page.tours.map(x => x.card?.image ? { src: x.card.image, alt: x.title, credit: '' } : null).find(Boolean)
    ?? page.tours.map(x => photoFor(x.title)).find(Boolean) ?? tourPhotos({ name: 'giza pyramids' })[0] ?? null
  return (
    <section className={`${s.container} ${s.hero}`} data-section="hero">
      <div className={s.heroText}>
        <h1 className={s.heroTitle}>{identity.tagline ?? companyName}</h1>
        {placeList && <p className={s.heroValue}>{t(lang, 'toursIn')} {placeList} — {t(lang, 'valueLine')}</p>}
        <div className={s.heroActions}>
          <a className={s.pillDark} href={`/${lang}/tours`}>{t(lang, 'browseTours')}</a>
          {wa && <a className={s.ghost} href={wa} rel="nofollow">WhatsApp</a>}
        </div>
        <RatingLine page={page} />
      </div>
      <div className={s.heroMedia}>
        {photo ? <Img photo={photo} className={s.heroImg} eager /> : <span className={s.panel} aria-hidden="true" />}
      </div>
    </section>
  )
}

// ---------- the tour page ----------

const distinctCities = (facts: TourFacts) => [...new Set(facts.days.map(d => d.city).filter((c): c is string => !!c))]

function Breadcrumb({ page, name }: { page: PagePayload; name: string }) {
  const lang = page.language
  return (
    <nav aria-label={t(lang, 'breadcrumb')} className={s.crumbs}>
      <ol>
        <li><a href={`/${lang}`}>{t(lang, 'home')}</a></li>
        <li><a href={`/${lang}/tours`}>{t(lang, 'tours')}</a></li>
        <li aria-current="page">{name}</li>
      </ol>
    </nav>
  )
}

function Gallery({ photos, name, lang }: { photos: Photo[]; name: string; lang: string }) {
  if (photos.length === 0) return null
  const shown = photos.slice(0, 5)
  return (
    <section className={s.gallery} data-count={shown.length} aria-label={name}>
      {shown.map((p, i) => <Img key={p.src} photo={p} className={i === 0 ? s.galleryMain : s.galleryImg} eager={i === 0} />)}
      {photos.length > 1 && (
        <>
          <button type="button" className={s.galleryAll} popoverTarget="all-photos">{t(lang, 'viewAllPhotos')} {photos.length} {t(lang, 'photosWord')}</button>
          <div id="all-photos" popover="auto" className={s.lightbox}>
            <button type="button" className={s.lightboxClose} popoverTarget="all-photos" popoverTargetAction="hide">{t(lang, 'close')}</button>
            <ul>{photos.map(p => <li key={p.src}><Img photo={p} /></li>)}</ul>
          </div>
        </>
      )}
    </section>
  )
}

function KeyFacts({ facts, lang }: { facts: TourFacts; lang: string }) {
  const length = facts.durationDays === 1 && facts.durationHours
    ? `${facts.durationHours} ${t(lang, facts.durationHours === 1 ? 'oneHour' : 'hours')}`
    : facts.durationNights > 0 ? `${countOf(lang, facts.durationDays, 'day')} · ${countOf(lang, facts.durationNights, 'night')}` : countOf(lang, facts.durationDays, 'day')
  const pickup = facts.pickup
    ? facts.pickup.included ? (facts.pickup.area ? `${t(lang, 'hotelPickupIn')} ${facts.pickup.area}` : t(lang, 'hotelPickup')) : t(lang, 'noPickup')
    : null
  const items: Array<[string, string | null | undefined]> = [
    [t(lang, 'duration'), length],
    [t(lang, 'tourTypeLabel'), facts.tourType],
    [t(lang, 'pickupLabel'), pickup],
    [t(lang, 'guideLabel'), facts.guideLanguages?.length ? facts.guideLanguages.join(', ') : null],
    [t(lang, 'cancellation'), cancellationHeadline(facts.cancellation, lang)],
  ]
  return (
    <ul className={s.keyFacts} data-section="groupSize">
      {items.filter(([, v]) => !!v).map(([label, value]) => (
        <li key={label}><span className={s.factLabel}>{label}</span><span className={s.factValue}>{value}</span></li>
      ))}
    </ul>
  )
}

/** A day tour: one open timeline of its stops, with approximate times where
 *  the operator gave them. */
function DayTimeline({ day, lang, text }: { day: TourFacts['days'][number]; lang: string; text: string | null }) {
  const stops = day.stops?.length ? day.stops : day.sights.map(name => ({ time: null, name }))
  const meals = (['breakfast', 'lunch', 'dinner'] as const).filter(m => day.meals[m])
  return (
    <div>
      {text && paragraphs(text).map((p, j) => <p key={j}>{p}</p>)}
      {stops.length > 0 && (
        <ol className={s.stops}>
          {stops.map((x, i) => (
            <li key={`${x.name}-${i}`}>
              {x.time && <span className={s.stopTime}>≈ {x.time}</span>}
              <span className={s.stopName}>{x.name}</span>
            </li>
          ))}
        </ol>
      )}
      {meals.length > 0 && <p className={s.muted}>{meals.map(m => t(lang, m)).join(' · ')}</p>}
      {stops.some(x => x.time) && <p className={s.muted}>{t(lang, 'approxTimes')}</p>}
    </div>
  )
}

function Itinerary({ facts, lang, narrative }: { facts: TourFacts; lang: string; narrative: PageNarrative | null }) {
  if (facts.days.length === 0) return null
  const text = new Map((narrative?.days ?? []).map(d => [d.day, narrativeText(d.segments, facts, lang)]))
  if (facts.days.length === 1) return <DayTimeline day={facts.days[0]} lang={lang} text={text.get(facts.days[0].day) ?? null} />
  const map = distinctCities(facts).length > 1
  return (
    <div className={map ? s.routeWrap : undefined}>
      {map && <RouteMap facts={facts} label={t(lang, 'itinerary')} className={s.map} />}
      <ol className={s.timeline}>
        {facts.days.map((d, i) => {
          const meals = (['breakfast', 'lunch', 'dinner'] as const).filter(m => d.meals[m])
          return (
            <li key={d.day} className={s.day}>
              <details open={i === 0}>
                <summary>
                  <span className={s.dayNo}>{t(lang, 'day')} {d.day}</span>
                  <span className={s.dayTitle}>{d.title ?? d.city ?? ''}</span>
                </summary>
                <div className={s.dayBody}>
                  {text.get(d.day) && paragraphs(text.get(d.day)!).map((p, j) => <p key={j}>{p}</p>)}
                  {d.sights.length > 0 && <p><strong>{t(lang, 'sights')}{colon(lang)}</strong> {d.sights.join(', ')}</p>}
                  {meals.length > 0 && <p className={s.muted}>{meals.map(m => t(lang, m)).join(' · ')}</p>}
                  {d.overnight && d.city && <p className={s.muted}>{t(lang, 'overnightIn')} {d.city}</p>}
                </div>
              </details>
            </li>
          )
        })}
      </ol>
    </div>
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

function Section({ id, title, children }: { id: string; title?: string; children: React.ReactNode }) {
  return (
    <section className={s.block} data-section={id}>
      {title && <h2 className={s.h2}>{title}</h2>}
      {children}
    </section>
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
  const listed = highlights.length ? highlights : facts ? [...new Set([...facts.highlights, ...facts.mainAttractions])] : []
  const cells = facts?.cancellation ? cancellationCells(facts.cancellation.tiers, lang) : []
  const free = facts ? cancellationHeadline(facts.cancellation, lang) : null
  const trust = [
    ...(free ? [free] : []),
    t(lang, 'trustNoPayment'),
    ...(page.site.identity.licenseNumber ? [`${t(lang, 'trustLicensed')} · ${page.site.identity.licenseNumber}`] : []),
  ]
  const pickup = facts?.pickup
  const related = finderTours(page.related ?? [], lang)

  return (
    <article>
      <div className={s.container}>
        {page.unpublished && <p className={s.unpublished}>{t(lang, 'notYetPublished')}</p>}
        <Breadcrumb page={page} name={tour.name} />
        <header className={s.tourHead} data-section="hero">
          <h1 className={s.tourTitle}>{tour.name}</h1>
          <RatingLine page={page} />
        </header>
        <Gallery photos={photos} name={tour.name} lang={lang} />
        {facts && <KeyFacts facts={facts} lang={lang} />}
      </div>

      <div className={`${s.container} ${s.tourGrid}`}>
        <div className={s.tourMain}>
          {overview && (
            <Section id="overview">
              {paragraphs(overview).map((p, i) => <p key={i} className={i === 0 ? s.lead : undefined}>{p}</p>)}
            </Section>
          )}
          {listed.length > 0 && (
            <Section id="highlights" title={t(lang, 'highlights')}>
              <ul className={s.iconList}>{listed.map(h => <li key={h}><Check />{h}</li>)}</ul>
            </Section>
          )}
          {facts && facts.days.length > 0 && (
            <Section id="itinerary" title={t(lang, 'itinerary')}>
              <Itinerary facts={facts} lang={lang} narrative={narrative} />
            </Section>
          )}
          {facts && (facts.inclusions.length > 0 || facts.exclusions.length > 0) && (
            <section className={`${s.block} ${s.twoCol}`} data-section="inclusions">
              {facts.inclusions.length > 0 && <div><h2 className={s.h2}>{t(lang, 'included')}</h2><Ticks items={facts.inclusions} kind="yes" /></div>}
              {facts.exclusions.length > 0 && <div><h2 className={s.h2}>{t(lang, 'notIncluded')}</h2><Ticks items={facts.exclusions} kind="no" /></div>}
            </section>
          )}
          {facts && facts.accommodation.length > 0 && (
            <Section id="accommodation" title={t(lang, 'whereYouStay')}>
              <ul className={s.iconList}>{facts.accommodation.map(a => <li key={`${a.kind}-${a.name}`}><Check />{a.kind === 'cruise' ? `${t(lang, 'nileCruise')}${colon(lang)} ${a.name}` : a.city ? `${a.name}, ${a.city}` : a.name}</li>)}</ul>
            </Section>
          )}
          {pickup && (
            <Section id="pickup" title={t(lang, 'pickupTitle')}>
              <dl className={s.defs}>
                <div><dt>{t(lang, 'pickupLabel')}</dt><dd>{pickup.included ? (pickup.area ? `${t(lang, 'hotelPickupIn')} ${pickup.area}` : t(lang, 'hotelPickup')) : t(lang, 'noPickup')}</dd></div>
                {pickup.meetingPoint && <div><dt>{t(lang, 'meetingPoint')}</dt><dd>{pickup.meetingPoint}</dd></div>}
              </dl>
            </Section>
          )}
          {facts?.cancellation && (cells.length > 0 || facts.cancellation.wording) && (
            <Section id="terms" title={t(lang, 'cancellation')}>
              {cells.length > 0 && (
                <ul className={s.cancelRow} style={{ '--cells': cells.length } as React.CSSProperties}>
                  {cells.map(c => (
                    <li key={c.when} className={c.free ? s.cancelFree : undefined}>
                      <span className={s.factLabel}>{c.when}</span>
                      <span className={s.cancelCharge}>{c.charge}</span>
                    </li>
                  ))}
                </ul>
              )}
              {facts.cancellation.wording && <p className={s.muted}>{facts.cancellation.wording}</p>}
            </Section>
          )}
          {facts && (facts.departureDays.length > 0 || facts.departures.length > 0) && (
            <div className={s.block} data-section="departures"><DeparturesSection facts={facts} lang={lang} variant="compact" /></div>
          )}
          {page.reviews && <div className={s.block} data-section="reviews"><Reviews page={page} /></div>}
          {facts?.faq && facts.faq.length > 0 && (
            <Section id="faq" title={t(lang, 'faqTitle')}>
              <div className={s.faq}>
                {facts.faq.map(f => (
                  <details key={f.question}>
                    <summary>{f.question}</summary>
                    {paragraphs(f.answer).map((p, i) => <p key={i}>{p}</p>)}
                  </details>
                ))}
              </div>
            </Section>
          )}
          <div className={s.block} data-section="enquiry"><EnquiryForm page={page} variant="compact" single /></div>
        </div>
        {facts && (
          <aside className={s.side}>
            <div className={s.sticky}>
              <BookingCard price={facts.price} lang={lang} whatsapp={whatsappHref(page)} trust={trust} />
            </div>
          </aside>
        )}
      </div>

      {related.length > 0 && (
        <section className={`${s.container} ${s.section}`} data-section="related">
          <h2 className={s.h2Big}>{t(lang, 'relatedTitle')}</h2>
          <ul className={s.cards}>{related.map(x => <li key={x.href}><TourCard tour={x} lang={lang} /></li>)}</ul>
        </section>
      )}
    </article>
  )
}

// ---------- about and contact ----------

function AboutPage({ page }: ThemePageProps) {
  const lang = page.language
  const { identity, companyName } = page.site
  const rows: Array<[string, string | null | undefined]> = [
    [t(lang, 'registeredCompany'), identity.legalEntity],
    [t(lang, 'licenceNumber'), identity.licenseNumber],
    [t(lang, 'addressLabel'), identity.address],
  ]
  return (
    <>
      <section className={`${s.container} ${s.pageHead}`}>
        <h1 className={s.h1}>{t(lang, 'aboutTitle')}</h1>
        <p className={s.lead}>{identity.tagline ?? companyName}</p>
      </section>
      <WhyUs page={page} />
      {rows.some(([, v]) => v) && (
        <section className={`${s.container} ${s.section}`} data-section="licences">
          <h2 className={s.h2Big}>{t(lang, 'aboutLicences')}</h2>
          <dl className={s.defs}>
            {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </section>
      )}
      {page.reviews && <div className={`${s.container} ${s.section}`}><Reviews page={page} /></div>}
      <CtaBand page={page} />
    </>
  )
}

function ContactPage({ page }: ThemePageProps) {
  const lang = page.language
  const { identity } = page.site
  const wa = whatsappHref(page)
  const email = emailHref(identity)
  const phone = phoneHref(identity)
  return (
    <section className={`${s.container} ${s.pageHead}`}>
      <h1 className={s.h1}>{t(lang, 'contactTitle')}</h1>
      <div className={s.contactGrid}>
        <div className={s.contactForm}>
          {/* The confirmation: shown in place of the form once it is sent. */}
          <div id="sent" className={s.sent} role="status">
            <span className={s.whyIcon}><Check /></span>
            <h2 className={s.h2}>{t(lang, 'sentTitle')}</h2>
            <p>{t(lang, 'sentText')}</p>
            <a className={s.ghost} href={`/${lang}/contact`}>{t(lang, 'sendAnother')}</a>
          </div>
          <EnquiryForm page={page} variant="compact" single showWhatsApp={false} />
        </div>
        <aside className={s.contactSide}>
          <h2 className={s.h2}>{t(lang, 'getInTouch')}</h2>
          <dl className={s.defs}>
            {wa && <div><dt>WhatsApp</dt><dd><a href={wa} rel="nofollow">{identity.whatsapp ?? t(lang, 'askOnWhatsApp')}</a></dd></div>}
            {email && <div><dt>{t(lang, 'emailLabel')}</dt><dd><a href={email}>{identity.email}</a></dd></div>}
            {phone && <div><dt>{t(lang, 'phoneLabel')}</dt><dd><a href={phone}>{identity.phone}</a></dd></div>}
            {identity.address && <div><dt>{t(lang, 'addressLabel')}</dt><dd>{identity.address}</dd></div>}
            {identity.licenseNumber && <div><dt>{t(lang, 'licenceNumber')}</dt><dd>{identity.licenseNumber}</dd></div>}
          </dl>
        </aside>
      </div>
    </section>
  )
}

// ---------- pages ----------

function Page(props: ThemePageProps) {
  const { page } = props
  const lang = page.language
  if (page.kind === 'home') {
    return (
      <>
        <HomeHero {...props} />
        <section className={`${s.container} ${s.section}`} data-section="popular">
          <div className={s.sectionHead}>
            <h2 className={s.h2Big}>{t(lang, 'popularTours')}</h2>
            <a className={s.more} href={`/${lang}/tours`}>{t(lang, 'allTours')} →</a>
          </div>
          {page.tours.length === 0 ? <p className={s.empty}>{t(lang, 'noToursYet')}</p> : <TourFinder tours={finderTours(page.tours, lang)} lang={lang} mode="chips" limit={6} />}
        </section>
        <WhyUs {...props} />
        <HowItWorks lang={lang} />
        {page.reviews && <div className={`${s.container} ${s.section}`}><Reviews page={page} /></div>}
        <Destinations {...props} />
        <CtaBand {...props} />
      </>
    )
  }
  if (page.kind === 'listing') {
    return (
      <>
        <section className={`${s.container} ${s.pageHead}`}>
          <h1 className={s.h1}>{t(lang, 'ourTours')}</h1>
          {page.tours.length === 0 ? <p className={s.empty}>{t(lang, 'noToursYet')}</p> : <TourFinder tours={finderTours(page.tours, lang)} lang={lang} mode="full" />}
        </section>
        <Destinations {...props} />
      </>
    )
  }
  if (page.kind === 'destination' && page.destination) {
    return (
      <>
        <section className={`${s.container} ${s.pageHead}`}>
          <p className={s.eyebrow}>{t(lang, 'destinationLabel')}</p>
          <h1 className={s.h1}>{page.destination.name}</h1>
          <h2 className={s.h2}>{t(lang, 'toursThere')}</h2>
          <TourFinder tours={finderTours(page.tours, lang)} lang={lang} mode="none" />
        </section>
        <Destinations {...props} />
      </>
    )
  }
  if (page.kind === 'tour' && page.tour) return <TourPage {...props} />
  if (page.kind === 'about') return <AboutPage {...props} />
  if (page.kind === 'contact') return <ContactPage {...props} />
  return (
    <section className={`${s.container} ${s.pageHead}`}>
      <h1 className={s.h1}>{page.title}</h1>
    </section>
  )
}

export const modern: Theme = {
  archetype: 'modern',
  label: 'Modern',
  description: 'Clean and photo-led for any palette: a gallery, key facts at a glance, a sticky price for each group size, FAQ and related tours.',
  // The order the page draws its sections in (TourPage); the booking card
  // beside them is a quick view of the 'price' section, not a second one.
  tourSections: ['hero', 'groupSize', 'overview', 'highlights', 'itinerary', 'inclusions', 'accommodation', 'terms', 'departures', 'enquiry', 'price'],
  Frame,
  Page,
}
