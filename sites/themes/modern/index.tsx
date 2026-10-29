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
import { PictureView } from '../blocks/SiteArt'
import { formatDate } from '../blocks/format'
import { agencyWebsite, emailHref, phoneHref, whatsappHref } from '../blocks/contact'
import { cancellationCells, cancellationHeadline } from '../blocks/cancellation'
import { narrativeText, paragraphs } from '../blocks/narrative'
import { colon, countOf, fill, t } from '../../i18n/strings'
import { defaultPicture, tourPicture, tourPhotos, type Picture } from '../../lib/photos'
import { RouteMap } from './RouteMap'
import { BookingCard } from './BookingCard'
import { TourCard, TourFinder, type FinderTour } from './TourFinder'
import { ShareButton } from './ShareButton'
import { GalleryRail } from './GalleryRail'
import { ContactForm } from './ContactForm'
import s from './theme.module.css'

const AUTOURA = 'https://getautoura.net'

function Check() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={s.icon}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
}

/** Line icons for the trust strip and "Why travel with us" — one per idea. */
const ICONS = {
  shield: <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3zM9 12l2 2 4-4" />,
  calendar: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />,
  chat: <path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  guide: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 21c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" />,
  tag: <path d="M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01" />,
  whatsapp: <path d="M5 19l1.2-3.6A7.5 7.5 0 1112 19.5a7.4 7.4 0 01-3.5-.9L5 19z" />,
  pin: <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />,
} as const
function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? s.icon}>{ICONS[name]}</svg>
}

// ---------- frame ----------

function Frame({ page, preview, children }: ThemePageProps & { children: React.ReactNode }) {
  const lang = page.language
  const { identity, companyName } = page.site
  const wa = whatsappHref(page)
  const email = emailHref(identity)
  const phone = phoneHref(identity)
  const site = agencyWebsite(page)
  const cta = page.kind === 'tour' ? '#enquire' : `/${lang}/contact`
  const links = [
    ['tours', `/${lang}/tours`, t(lang, 'tours')],
    ['about', `/${lang}/about`, t(lang, 'aboutTitle')],
    ['contact', `/${lang}/contact`, t(lang, 'contact')],
  ] as const
  const current = (k: string) => (page.kind === 'listing' && k === 'tours') || page.kind === k ? 'page' : undefined
  return (
    <div className={s.page}>
      {preview && <div className={s.preview}>{t(lang, 'previewBanner')}</div>}
      <header className={s.headerBar}>
        <div className={`${s.container} ${s.header}`}>
          <BrandMark page={page} className={s.brand} />
          <nav className={s.navLinks} aria-label={companyName}>
            {links.map(([k, href, label]) => <a key={k} href={href} aria-current={current(k)}>{label}</a>)}
            {site && <a href={site.href}>{site.label} ↗</a>}
          </nav>
          <div className={s.headerEnd}>
            <LanguageMenu page={page} className={s.langMenu} listClassName={s.langList} />
            <a className={s.navCta} href={cta}>{t(lang, 'planYourJourney')}</a>
            {/* Phones: the same links behind one button, without script. */}
            <details className={s.menu}>
              <summary aria-label={t(lang, 'menu')}><svg viewBox="0 0 24 24" aria-hidden="true" className={s.icon}><path d="M4 7h16M4 12h16M4 17h16" /></svg></summary>
              <div className={s.menuPanel}>
                {links.map(([k, href, label]) => <a key={k} href={href} aria-current={current(k)}>{label}</a>)}
                {site && <a href={site.href}>{site.label} ↗</a>}
                <a className={s.pillDark} href={cta}>{t(lang, 'planYourJourney')}</a>
              </div>
            </details>
          </div>
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
            <div>
              <p className={s.footerHead}>{t(lang, 'contactHeading')}</p>
              <ul className={s.footerList}>
                {email && <li><a href={email}>{identity.email}</a></li>}
                {wa && <li><a href={wa} rel="nofollow">WhatsApp{identity.whatsapp ? ` ${identity.whatsapp}` : ''}</a></li>}
                {phone && <li><a href={phone}>{identity.phone}</a></li>}
                {identity.address && <li>{identity.address}</li>}
              </ul>
            </div>
            <div>
              <p className={s.footerHead}>{t(lang, 'companyHeading')}</p>
              <ul className={s.footerList}>
                {identity.legalEntity && <li>{identity.legalEntity}</li>}
                {identity.licenseNumber && <li>{t(lang, 'etaaLicence')} {identity.licenseNumber}</li>}
                <li><a href={`/${lang}/about`}>{t(lang, 'aboutTitle')}</a></li>
              </ul>
            </div>
            <div>
              <p className={s.footerHead}>{t(lang, 'legalHeading')}</p>
              <ul className={s.footerList}>
                {identity.termsUrl && <li><a href={identity.termsUrl}>{t(lang, 'bookingTerms')}</a></li>}
                {identity.privacyUrl && <li><a href={identity.privacyUrl}>{t(lang, 'privacyPolicy')}</a></li>}
                <li><button type="button" className={s.linkButton} popoverTarget="cookie-settings">{t(lang, 'cookieSettings')}</button></li>
              </ul>
            </div>
          </div>
          <div className={s.footerLegal}>
            <p>© {new Date().getFullYear()} {identity.legalEntity ?? companyName}</p>
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

/** The page's tours as cards: the agency's own photo, else the default
 *  picture of the tour's first itinerary site. */
function finderTours(list: PagePayload['tours'], lang: string): FinderTour[] {
  return list.map(tour => {
    const c = tour.card
    return {
      title: tour.title, href: `/${lang}/${tour.path}`,
      picture: tourPicture({ name: tour.title, image: c?.image, places: c?.places, cities: c?.cities }),
      days: c?.days ?? null, nights: c?.nights ?? null, hours: c?.hours ?? null, cities: c?.cities ?? [], type: c?.type ?? null, from: c?.from ?? null,
      highlights: c?.highlights ?? [], guideLanguages: c?.guideLanguages ?? [],
    }
  })
}

/** "Cairo", "Cairo and Luxor", "Cairo, Luxor and Aswan". */
function listOf(lang: string, items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} ${t(lang, 'and')} ${items[items.length - 1]}` : items[0] ?? ''
}

/** The places the site's tours go, most-visited first. */
const placesOf = (page: PagePayload) => (page.destinations ?? []).map(d => d.name)

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

/** Where the tours go — only when there is more than one place to choose. */
function Destinations({ page, soft }: { page: PagePayload; soft?: boolean }) {
  const lang = page.language
  const all = page.destinations ?? []
  if (all.length < 2) return null
  const list = all.filter(d => d.path !== `destinations/${page.destination?.slug}`).slice(0, 6)
  return (
    <section className={soft ? s.soft : undefined} data-section="destinations">
      <div className={`${s.container} ${s.section}`}>
        <h2 className={s.h2Big}>{t(lang, 'destinationsTitle')}</h2>
        <ul className={s.places} data-n={list.length}>
          {list.map(d => (
            <li key={d.path}>
              <a className={s.place} href={`/${lang}/${d.path}`}>
                <span className={s.placeMedia}><PictureView picture={defaultPicture([d.name])} className={s.cardImg} decorative /></span>
                <span className={s.placeName}>{d.name}</span>
                <span className={s.placeCount}>{d.count} {t(lang, d.count === 1 ? 'oneTourWord' : 'toursWord')}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** The trust strip under the home hero: only what the records can show —
 *  the licence, the years, the guides' languages, a real review score. */
function TrustStrip({ page }: { page: PagePayload }) {
  const lang = page.language
  const { identity } = page.site
  const langs = [...new Set(page.tours.flatMap(x => x.card?.guideLanguages ?? []))]
  const r = page.reviews
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const years = identity.foundedYear ? new Date().getFullYear() - identity.foundedYear : 0
  const items: Array<{ icon: keyof typeof ICONS; title: string; text: string | null }> = [
    ...(identity.licenseNumber ? [{ icon: 'shield' as const, title: t(lang, 'licensedByEtaa'), text: `${t(lang, 'licenceNo')} ${identity.licenseNumber}` }] : []),
    ...(identity.foundedYear ? [{ icon: 'calendar' as const, title: `${t(lang, 'operatingSince')} ${identity.foundedYear}`, text: years > 1 ? `${years} ${t(lang, 'yearsWord')}` : null }] : []),
    ...(langs.length ? [{ icon: 'chat' as const, title: t(lang, 'guidesSpeak'), text: langs.join(', ') }] : []),
    ...(r && r.rating !== null ? [{ icon: 'star' as const, title: `${nf.format(r.rating)}${r.count ? ` ${fill(lang, 'reviewsFromCount', { n: new Intl.NumberFormat(lang).format(r.count) })}` : ''}`, text: t(lang, 'onGoogle') }] : []),
  ]
  if (items.length === 0) return null
  return (
    <section className={s.container} data-section="trust">
      <ul className={s.trustStrip} style={{ '--n': items.length } as React.CSSProperties}>
        {items.map(x => (
          <li key={x.icon}>
            <Icon name={x.icon} className={x.icon === 'star' ? s.trustStar : s.trustIcon} />
            <span><strong>{x.title}</strong>{x.text && <span className={s.trustText}>{x.text}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** What the agency can truly promise, each with its own icon and line. */
function whyItems(page: PagePayload): Array<{ icon: keyof typeof ICONS; title: string; text: string }> {
  const lang = page.language
  const priced = page.tours.map(x => x.card?.from).find(Boolean) ?? page.tour?.facts?.price
  const currency = priced && 'currency' in priced ? priced.currency : null
  const items: Array<{ icon: keyof typeof ICONS; title: string; text: string }> = [
    { icon: 'guide', title: t(lang, 'whyGuides'), text: t(lang, 'whyGuidesText') },
  ]
  if (page.tours.some(x => x.card?.from) && currency) items.push({ icon: 'tag', title: t(lang, 'whyOnePrice'), text: fill(lang, 'whyOnePriceIn', { currency }) })
  items.push({ icon: 'chat', title: t(lang, 'trustNoPayment'), text: t(lang, 'whyNoPaymentLine') })
  if (page.site.identity.licenseNumber) items.push({ icon: 'shield', title: t(lang, 'licensedByEtaa'), text: fill(lang, 'whyLicensedLine', { n: page.site.identity.licenseNumber }) })
  return items
}

function WhyUs({ page }: { page: PagePayload }) {
  const items = whyItems(page)
  return (
    <section className={s.soft} data-section="why">
      <div className={`${s.container} ${s.section}`}>
        <h2 className={s.h2Big}>{t(page.language, 'whyTitle')}</h2>
        <ul className={s.why} style={{ '--n': items.length } as React.CSSProperties}>
          {items.map(x => (
            <li key={x.title}>
              <span className={s.whyIcon}><Icon name={x.icon} /></span>
              <span className={s.whyTitle}>{x.title}</span>
              <span className={s.whyText}>{x.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function HowItWorks({ lang }: { lang: string }) {
  const steps = [['how1', 'how1Text'], ['how2', 'how2Text'], ['how3', 'how3Text']] as const
  return (
    <section className={`${s.container} ${s.section}`} data-section="how">
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
    </section>
  )
}

/** "Don't see what you need?" — on Home (dark) and Tours (soft). */
function CustomTripBand({ page, tone }: { page: PagePayload; tone: 'dark' | 'soft' }) {
  const lang = page.language
  const wa = whatsappHref(page)
  return (
    <section className={`${s.container} ${s.section}`} data-section="custom">
      <div className={tone === 'dark' ? s.cta : `${s.cta} ${s.ctaSoft}`}>
        <div>
          <h2 className={s.ctaTitle}>{t(lang, 'customTitle')}</h2>
          <p className={s.ctaText}>{t(lang, 'customText')}</p>
        </div>
        <div className={s.ctaActions}>
          <a className={tone === 'dark' ? s.pillLight : s.pillDark} href={`/${lang}/contact`}>{t(lang, 'planYourJourney')}</a>
          {wa && <a className={tone === 'dark' ? s.pillGhostLight : s.ghost} href={wa} rel="nofollow"><Icon name="whatsapp" />{t(lang, 'whatsappUs')}</a>}
        </div>
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
          <a className={s.pillLight} href={`/${lang}/contact`}>{t(lang, 'enquireGeneral')}</a>
          {wa && <a className={s.pillGhostLight} href={wa} rel="nofollow">{t(lang, 'askOnWhatsApp')}</a>}
        </div>
      </div>
    </section>
  )
}

// ---------- home ----------

function HomeHero({ page }: ThemePageProps) {
  const lang = page.language
  const { identity } = page.site
  const wa = whatsappHref(page)
  const places = placesOf(page)
  const one = places.length === 1 ? places[0] : null
  const headline = identity.headline ?? (one ? fill(lang, 'heroTitleIn', { place: one }) : t(lang, 'heroTitleAcross'))
  const priced = page.tours.some(x => x.card?.from)
  // With one place, the subline names it when the agency wrote its own headline.
  const sub = [identity.headline && one ? fill(lang, 'heroSubIn', { place: one }) : null, t(lang, priced ? 'heroSubPrice' : 'heroSubAsk')].filter(Boolean).join(' ')
  // The agency's own photo where it has one, else the main destination's picture.
  const own = page.tours.find(x => x.card?.image)
  const picture: Picture = own?.card?.image ? { kind: 'photo', src: own.card.image, alt: own.title } : defaultPicture([places[0], ...page.tours.flatMap(x => x.card?.places ?? [])])
  const single = page.tours.length === 1 ? `/${lang}/${page.tours[0].path}` : null
  return (
    <section className={`${s.container} ${s.hero}`} data-section="hero">
      <div className={s.heroText}>
        {identity.licenseNumber && <p className={s.eyebrow}>{one ? fill(lang, 'heroEyebrowIn', { place: one }) : t(lang, 'heroEyebrowAcross')}</p>}
        <h1 className={s.heroTitle}>{headline}</h1>
        <p className={s.heroValue}>{sub}</p>
        <div className={s.heroActions}>
          <a className={s.pillDark} href={single ?? `/${lang}/tours`}>{t(lang, single ? 'seeTheTour' : 'browseTours')}</a>
          {wa && <a className={s.ghost} href={wa} rel="nofollow"><Icon name="whatsapp" />{t(lang, 'whatsappUs')}</a>}
        </div>
      </div>
      <div className={s.heroMedia}>
        <PictureView picture={picture} className={s.heroImg} eager />
      </div>
    </section>
  )
}

function HomeTours({ page }: { page: PagePayload }) {
  const lang = page.language
  const n = page.tours.length
  return (
    <section className={`${s.container} ${s.section}`} data-section="popular">
      <div className={s.sectionHead}>
        <h2 className={s.h2Big}>{t(lang, n === 1 ? 'ourTour' : 'popularTours')}</h2>
        {n > 3 && <a className={s.more} href={`/${lang}/tours`}>{fill(lang, 'allNTours', { n })}</a>}
      </div>
      {n === 0 ? <p className={s.empty}>{t(lang, 'noToursYet')}</p> : <TourFinder tours={finderTours(page.tours, lang)} lang={lang} where="home" limit={6} />}
    </section>
  )
}

function HomePage(props: ThemePageProps) {
  const { page } = props
  const lang = page.language
  const large = page.tours.length >= 7
  return (
    <>
      <HomeHero {...props} />
      <TrustStrip page={page} />
      {large && <Destinations page={page} soft />}
      <HomeTours page={page} />
      <WhyUs page={page} />
      {large && <HowItWorks lang={lang} />}
      {!large && <Destinations page={page} />}
      {page.reviews && <div className={`${s.container} ${s.section}`}><Reviews page={page} /></div>}
      <CustomTripBand page={page} tone="dark" />
    </>
  )
}

function ToursPage({ page }: ThemePageProps) {
  const lang = page.language
  const places = placesOf(page)
  const priced = page.tours.some(x => x.card?.from)
  const intro = [places.length ? fill(lang, 'toursIntroIn', { places: listOf(lang, places.slice(0, 4)) }) : null, priced ? t(lang, 'toursIntroPrice') : null].filter(Boolean).join(' ')
  return (
    <>
      <section className={`${s.container} ${s.pageHead}`}>
        <nav aria-label={t(lang, 'breadcrumb')} className={s.crumbs}>
          <ol><li><a href={`/${lang}`}>{t(lang, 'home')}</a></li><li aria-current="page">{t(lang, 'tours')}</li></ol>
        </nav>
        <h1 className={s.h1}>{t(lang, 'ourTours')}</h1>
        {intro && <p className={s.intro}>{intro}</p>}
        {page.tours.length === 0 ? <p className={s.empty}>{t(lang, 'noToursYet')}</p> : <TourFinder tours={finderTours(page.tours, lang)} lang={lang} where="listing" />}
      </section>
      <CustomTripBand page={page} tone="soft" />
    </>
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

function Gallery({ pictures, name, lang }: { pictures: Picture[]; name: string; lang: string }) {
  const shown = pictures.slice(0, 5)
  const photos = pictures.filter(p => p.kind === 'photo')
  return (
    <section className={s.gallery} data-count={shown.length}>
      <GalleryRail count={shown.length} label={name}>
        {shown.map((p, i) => <PictureView key={p.kind === 'photo' ? p.src : p.art} picture={p} className={i === 0 ? s.galleryMain : s.galleryImg} eager={i === 0} fit={shown.length === 1 ? 'contain' : 'cover'} />)}
      </GalleryRail>
      {photos.length > 1 && (
        <>
          <button type="button" className={s.galleryAll} popoverTarget="all-photos">{t(lang, 'viewAllPhotos')} {photos.length} {t(lang, 'photosWord')}</button>
          <div id="all-photos" popover="auto" className={s.lightbox}>
            <button type="button" className={s.lightboxClose} popoverTarget="all-photos" popoverTargetAction="hide">{t(lang, 'close')}</button>
            <ul>{photos.map(p => <li key={p.kind === 'photo' ? p.src : ''}><PictureView picture={p} /></li>)}</ul>
          </div>
        </>
      )}
    </section>
  )
}

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** "Runs Mon, Wed and Fri" — the booking card's line under the date. */
function runsText(facts: TourFacts, lang: string): string | null {
  if (facts.departureDays.length === 7) return t(lang, 'runsEveryDay')
  if (facts.departureDays.length === 0) return null
  const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' })
  const names = WEEK.filter(d => facts.departureDays.includes(d)).map(d => fmt.format(new Date(Date.UTC(2023, 0, 2 + WEEK.indexOf(d)))))
  // British English, as the site's own words are ("Mon, Wed and Fri").
  return `${t(lang, 'runsOn')} ${new Intl.ListFormat(lang === 'en' ? 'en-GB' : lang, { style: 'long', type: 'conjunction' }).format(names)}`
}

/** "Mon, Wed, Fri" — or "Every day"; else the next dated departure. */
function departsText(facts: TourFacts, lang: string): string | null {
  if (facts.departureDays.length === 7) return t(lang, 'everyDay')
  if (facts.departureDays.length > 0) {
    const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' })
    // 2023-01-02 was a Monday.
    return WEEK.filter(d => facts.departureDays.includes(d)).map(d => fmt.format(new Date(Date.UTC(2023, 0, 2 + WEEK.indexOf(d))))).join(', ')
  }
  const next = facts.departures.find(d => d.status !== 'full')
  return next ? `${t(lang, 'nextDeparture')} ${formatDate(next.date, lang)}` : null
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
    [t(lang, 'departs'), departsText(facts, lang)],
    [t(lang, 'guideSpeaks'), facts.guideLanguages?.length ? facts.guideLanguages.join(', ') : null],
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

/** A day tour: one open timeline of its stops, the approximate time of each
 *  beside it where the operator gave one. */
function DayTimeline({ day, lang, text }: { day: TourFacts['days'][number]; lang: string; text: string | null }) {
  const stops = day.stops?.length ? day.stops : day.sights.map(name => ({ time: null, name }))
  const timed = stops.some(x => x.time)
  const meals = (['breakfast', 'lunch', 'dinner'] as const).filter(m => day.meals[m])
  return (
    <div>
      {text && paragraphs(text).map((p, j) => <p key={j}>{p}</p>)}
      {stops.length > 0 && (
        <ol className={timed ? `${s.stops} ${s.stopsTimed}` : s.stops}>
          {stops.map((x, i) => (
            <li key={`${x.name}-${i}`}>
              {timed && <span className={s.stopTime}>{x.time ?? ''}</span>}
              <span className={s.stopDot} aria-hidden="true" />
              <span className={s.stopName}>{x.name}</span>
            </li>
          ))}
        </ol>
      )}
      {meals.length > 0 && <p className={s.muted}>{meals.map(m => t(lang, m)).join(' · ')}</p>}
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

function Section({ id, title, note, children }: { id: string; title?: string; note?: string | null; children: React.ReactNode }) {
  return (
    <section className={s.block} data-section={id}>
      {title && <div className={s.blockHead}><h2 className={s.h2}>{title}</h2>{note && <span className={s.muted}>{note}</span>}</div>}
      {children}
    </section>
  )
}

function TourPage({ page }: ThemePageProps) {
  const lang = page.language
  const tour = page.tour!
  const facts = tour.facts
  const narrative = tour.narrative
  const sights = facts ? [...facts.days.flatMap(d => [...d.sights, ...(d.stops ?? []).map(x => x.name)]), ...facts.mainAttractions] : []
  const photos: Picture[] = tourPhotos({ name: tour.name, images: facts?.images, sights, cities: facts?.days.map(d => d.city) })
    .map(p => ({ kind: 'photo' as const, src: p.src, alt: p.alt }))
  // Never an empty gallery: the default picture of the tour's first site.
  const pictures = photos.length ? photos : [defaultPicture([...sights, tour.name, ...(facts?.days.map(d => d.city) ?? [])])]
  const overview = narrativeText(narrative?.overview, facts, lang)
  const highlights = (narrative?.highlights ?? []).map(h => narrativeText(h, facts, lang)).filter((h): h is string => !!h)
  const listed = highlights.length ? highlights : facts ? [...new Set([...facts.highlights, ...facts.mainAttractions])] : []
  const cells = facts?.cancellation ? cancellationCells(facts.cancellation.tiers, lang) : []
  const free = facts ? cancellationHeadline(facts.cancellation, lang) : null
  const trust: Array<{ text: string; licence?: boolean }> = [
    ...(free ? [{ text: free }] : []),
    { text: t(lang, 'trustNoPayment') },
    ...(page.site.identity.licenseNumber ? [{ text: `${t(lang, 'licensedByEtaa')} · ${t(lang, 'licenceNo')} ${page.site.identity.licenseNumber}`, licence: true }] : []),
  ]
  const pickup = facts?.pickup
  const related = finderTours(page.related ?? [], lang)

  return (
    <article>
      <div className={s.container}>
        {page.unpublished && <p className={s.unpublished}>{t(lang, 'notYetPublished')}</p>}
        <Breadcrumb page={page} name={tour.name} />
        <header className={s.tourHead} data-section="hero">
          <div className={s.tourHeadRow}>
            <h1 className={s.tourTitle}>{tour.name}</h1>
            <ShareButton title={tour.name} lang={lang} />
          </div>
          <div className={s.byLine}>
            <RatingLine page={page} />
            {/* A tour with dated departures is shared; otherwise it is the visitor's own. */}
            <span>{t(lang, facts && facts.departures.length > 0 ? 'tourBy' : 'privateTourBy')} {page.site.companyName}</span>
          </div>
        </header>
        <Gallery pictures={pictures} name={tour.name} lang={lang} />
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
            <Section id="itinerary" title={t(lang, facts.days.length === 1 ? 'yourDay' : 'itinerary')} note={facts.days.length === 1 && facts.days[0].stops?.some(x => x.time) ? t(lang, 'approxTimes') : null}>
              <Itinerary facts={facts} lang={lang} narrative={narrative} />
            </Section>
          )}
          {facts && (facts.inclusions.length > 0 || facts.exclusions.length > 0) && (
            <section className={`${s.block} ${s.twoCol} ${s.includedBox}`} data-section="inclusions">
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
              <ul className={s.pickupCards}>
                <li>
                  <Icon name="pin" className={s.pickupIcon} />
                  <span>
                    <strong>{pickup.included ? t(lang, 'hotelPickup') : t(lang, 'noPickup')}</strong>
                    {pickup.included && pickup.area && <span className={s.pickupText}>{fill(lang, 'pickupFromHotel', { area: pickup.area })}</span>}
                  </span>
                </li>
                {pickup.meetingPoint && (
                  <li>
                    <Icon name="chat" className={s.pickupIcon} />
                    <span><strong>{t(lang, 'meetingPoint')}</strong><span className={s.pickupText}>{pickup.meetingPoint}</span></span>
                  </li>
                )}
              </ul>
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
          {/* The weekdays sit in the key facts; dated departures are listed here. */}
          {facts && facts.departures.length > 0 && (
            <div className={s.block} data-section="departures"><DeparturesSection facts={{ ...facts, departureDays: [] }} lang={lang} variant="compact" /></div>
          )}
          {page.reviews && <div className={s.block} data-section="reviews"><Reviews page={page} /></div>}
          {facts?.faq && facts.faq.length > 0 && (
            <Section id="faq" title={t(lang, 'questionsTitle')}>
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
          <div className={`${s.block} ${s.enquiryCard}`} data-section="enquiry"><EnquiryForm page={page} variant="compact" single title={t(lang, 'askTourTitle')} intro={t(lang, 'askTourSub')} /></div>
        </div>
        {facts && (
          <aside className={s.side}>
            <div className={s.sticky}>
              <BookingCard price={facts.price} lang={lang} whatsapp={whatsappHref(page)} trust={trust} runs={runsText(facts, lang)} />
            </div>
          </aside>
        )}
      </div>

      {related.length > 0 && (
        <section className={`${s.container} ${s.section}`} data-section="related">
          <h2 className={s.h2Big}>{t(lang, 'pairItWith')}</h2>
          <ul className={s.cards}>{related.map(x => <li key={x.href}><TourCard tour={x} lang={lang} /></li>)}</ul>
        </section>
      )}
    </article>
  )
}

// ---------- about and contact ----------

/** "09:00 to 21:00 Cairo time, every day" — or the weekdays it is open. */
function hoursText(hours: NonNullable<PagePayload['site']['identity']['hours']>, lang: string): string {
  const days = hours.days.length === 7 ? t(lang, 'everyDayLower') : (() => {
    const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' })
    return WEEK.filter(d => hours.days.includes(d)).map(d => fmt.format(new Date(Date.UTC(2023, 0, 2 + WEEK.indexOf(d))))).join(', ')
  })()
  return fill(lang, 'hoursSpan', { opens: hours.opens, closes: hours.closes, days })
}

/** "Nile & Co Travel S.A.E. · ETAA licence No. 1234" — what the records give. */
function legalLine(identity: PagePayload['site']['identity'], lang: string): string | null {
  const parts = [identity.legalEntity, identity.licenseNumber && `${t(lang, 'etaaLicence')} ${identity.licenseNumber}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function Initials({ name }: { name: string }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
  return <span className={s.initials} aria-hidden="true">{letters}</span>
}

function AboutPage({ page }: ThemePageProps) {
  const lang = page.language
  const { identity, companyName } = page.site
  const about = page.aboutPage ?? { headline: null, teamPhoto: null, people: [] }
  const guides = about.people.filter(p => p.kind === 'guide').length
  const languages = [...new Set(about.people.flatMap(p => p.languages))]
  const names = new Intl.DisplayNames([lang], { type: 'language' })
  const langName = (code: string) => { const n = names.of(code) ?? code; return n.charAt(0).toLocaleUpperCase(lang) + n.slice(1) }
  const r = page.reviews
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  // Only what the records show: no stat is drawn without its number.
  const stats: Array<[string, string]> = [
    ...(identity.foundedYear ? [[String(identity.foundedYear), t(lang, 'statFounded')] as [string, string]] : []),
    ...(guides ? [[String(guides), t(lang, 'statGuides')] as [string, string]] : []),
    ...(languages.length ? [[String(languages.length), t(lang, 'statLanguages')] as [string, string]] : []),
    ...(r && r.rating !== null ? [[nf.format(r.rating), t(lang, 'statReview')] as [string, string]] : []),
  ]
  const promises = [['promisePrice', 'promisePriceText'], ['promiseTeam', 'promiseTeamText'], ['promiseReach', 'promiseReachText']] as const
  const legal = legalLine(identity, lang)
  return (
    <>
      <section className={`${s.container} ${s.pageHead}`} data-section="about">
        {about.headline && <p className={s.eyebrow}>{t(lang, 'aboutEyebrow')}</p>}
        <h1 className={`${s.h1} ${s.aboutHeadline}`}>{about.headline ?? t(lang, 'aboutTitle')}</h1>
        {page.about
          ? <div className={s.aboutText}>{paragraphs(page.about).map((p, i) => <p key={i} className={i === 0 ? s.lead : undefined}>{p}</p>)}</div>
          : <p className={s.lead}>{identity.tagline ?? companyName}</p>}
        {about.teamPhoto && (
          // eslint-disable-next-line @next/next/no-img-element -- the agency's own upload; sized by CSS
          <img src={about.teamPhoto} alt={companyName} className={s.teamPhoto} loading="eager" decoding="async" />
        )}
        {stats.length > 0 && (
          <ul className={s.stats} style={{ '--n': stats.length } as React.CSSProperties} data-section="stats">
            {stats.map(([n, label]) => <li key={label}><strong>{n}</strong><span>{label}</span></li>)}
          </ul>
        )}
      </section>
      {about.people.length > 0 && (
        <section className={s.soft} data-section="people">
          <div className={`${s.container} ${s.section}`}>
            <h2 className={s.h2Big}>{t(lang, 'peopleTitle')}</h2>
            <ul className={s.people}>
              {about.people.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <span className={s.portrait}>
                    {p.photo
                      // eslint-disable-next-line @next/next/no-img-element -- the agency's own upload; sized by CSS
                      ? <img src={p.photo} alt={p.name} loading="lazy" decoding="async" />
                      : <Initials name={p.name} />}
                  </span>
                  <span className={s.personName}>{p.name}</span>
                  <span className={s.personRole}>{[p.role, p.languages.map(langName).join(', ')].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <section className={`${s.container} ${s.section}`} data-section="promises">
        <h2 className={s.h2Big}>{t(lang, 'promiseTitle')}</h2>
        <ul className={s.promises}>
          {promises.map(([title, text]) => (
            <li key={title}><span className={s.whyTitle}>{t(lang, title)}</span><span className={s.whyText}>{t(lang, text)}</span></li>
          ))}
        </ul>
      </section>
      {legal && (
        <section className={s.container} data-section="licences">
          <div className={s.licences}>
            <h2 className={s.h2}>{t(lang, 'licencesTitle')}</h2>
            <p>{legal}{identity.address ? ` · ${identity.address}` : ''}</p>
          </div>
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
  const legal = legalLine(identity, lang)
  return (
    <section className={`${s.container} ${s.pageHead}`}>
      <div className={s.contactGrid}>
        <div className={s.contactForm}>
          <h1 className={s.h1}>{t(lang, 'planTitle')}</h1>
          <p className={s.intro}>{t(lang, 'planIntro')}</p>
          {/* The confirmation: shown in place of the form once it is sent. */}
          <div id="sent" className={s.sent} role="status">
            <span className={s.whyIcon}><Check /></span>
            <h2 className={s.h2}>{t(lang, 'sentTitle')}</h2>
            <p>{t(lang, 'sentText')}</p>
            <a className={s.ghost} href={`/${lang}/contact`}>{t(lang, 'sendAnother')}</a>
          </div>
          <ContactForm page={page} />
        </div>
        <aside className={s.contactAside}>
          <div className={s.contactSide}>
            <h2 className={s.h2}>{t(lang, 'preferToTalk')}</h2>
            {wa && <a className={`${s.pillDark} ${s.wide}`} href={wa} rel="nofollow"><Icon name="whatsapp" />{t(lang, 'whatsappUs')}</a>}
            <dl className={s.contactDefs}>
              {email && <div><dt>{t(lang, 'emailLabel')}</dt><dd><a href={email}>{identity.email}</a></dd></div>}
              {phone && <div><dt>{t(lang, 'phoneLabel')}</dt><dd><a href={phone}>{identity.phone}</a></dd></div>}
              {identity.hours && <div><dt>{t(lang, 'hoursLabel')}</dt><dd>{hoursText(identity.hours, lang)}</dd></div>}
              {identity.address && <div><dt>{t(lang, 'officeLabel')}</dt><dd>{identity.address}</dd></div>}
            </dl>
          </div>
          {legal && <p className={s.muted}>{legal}</p>}
        </aside>
      </div>
    </section>
  )
}

// ---------- pages ----------

function Page(props: ThemePageProps) {
  const { page } = props
  const lang = page.language
  if (page.kind === 'home') return <HomePage {...props} />
  if (page.kind === 'listing') return <ToursPage {...props} />
  if (page.kind === 'destination' && page.destination) {
    return (
      <>
        <section className={`${s.container} ${s.pageHead}`}>
          <p className={s.eyebrow}>{t(lang, 'destinationLabel')}</p>
          <h1 className={s.h1}>{page.destination.name}</h1>
          <h2 className={s.h2}>{t(lang, 'toursThere')}</h2>
          <TourFinder tours={finderTours(page.tours, lang)} lang={lang} where="destination" />
        </section>
        <Destinations page={page} />
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
