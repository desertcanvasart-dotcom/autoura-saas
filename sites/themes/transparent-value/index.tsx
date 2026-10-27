// ============================================
// Archetype: Transparent value (modelled on AffordEgypt)
// ============================================
// Budget and day-tour operators competing on clear pricing. Price-led tour
// grid, inclusions up front, WhatsApp as the first way to ask (PLAN §2).
// Prices are facts from records (step 5): until then a card says "See
// details" — never a placeholder number.

import type { Theme, ThemePageProps } from '../types'
import { BrandMark } from '../blocks/BrandMark'
import { LanguageLinks } from '../blocks/LanguageLinks'
import { TourSections } from '../blocks/TourSections'
import { OverviewSection, AccommodationSection, CancellationSection, DeparturesSection, GroupSizeSection, HighlightsSection, InclusionsSection, ItinerarySection, PriceSection, TourImage } from '../blocks/TourFacts'
import { emailHref, phoneHref, whatsappHref } from '../blocks/contact'
import { t } from '../../i18n/strings'
import s from './theme.module.css'

function Frame({ page, preview, children }: ThemePageProps & { children: React.ReactNode }) {
  const lang = page.language
  const { identity, companyName } = page.site
  const wa = whatsappHref(identity)
  const email = emailHref(identity)
  const phone = phoneHref(identity)
  return (
    <div className={s.page}>
      {preview && <div className={s.preview}>{t(lang, 'previewBanner')}</div>}
      <header className={s.header}>
        <BrandMark page={page} className={s.brand} />
        <nav className={s.nav} aria-label={companyName}>
          <a href={`/${lang}/tours`}>{t(lang, 'tours')}</a>
          <LanguageLinks page={page} className={s.languages} />
          {wa && <a className={s.waButton} href={wa} rel="noopener">{t(lang, 'askOnWhatsApp')}</a>}
        </nav>
      </header>
      <main className={s.main}>{children}</main>
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <strong>{companyName}</strong>
          <ul className={s.footerContact}>
            {wa && <li><a href={wa} rel="noopener">WhatsApp {identity.whatsapp}</a></li>}
            {phone && <li><a href={phone}>{identity.phone}</a></li>}
            {email && <li><a href={email}>{identity.email}</a></li>}
            {identity.address && <li>{identity.address}</li>}
          </ul>
          {identity.licenseNumber && <p className={s.licence}>{t(lang, 'licensed')} {identity.licenseNumber}</p>}
        </div>
      </footer>
      {/* On a phone the way to ask stays in reach. */}
      {wa && <a className={s.stickyWa} href={wa} rel="noopener">{t(lang, 'askOnWhatsApp')}</a>}
    </div>
  )
}

function TourGrid({ page }: ThemePageProps) {
  const lang = page.language
  if (page.tours.length === 0) return <p className={s.empty}>{t(lang, 'noToursYet')}</p>
  return (
    <ul className={s.grid}>
      {page.tours.map(tour => (
        <li key={tour.path}>
          <a className={s.card} href={`/${lang}/${tour.path}`}>
            <span className={s.cardTitle}>{tour.title}</span>
            <span className={s.cardCta}>{t(lang, 'seeDetails')}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function Page(props: ThemePageProps) {
  const { page } = props
  const lang = page.language
  const wa = whatsappHref(page.site.identity)
  if (page.kind === 'home') {
    const { identity, companyName } = page.site
    return (
      <>
        <section className={s.hero}>
          <h1 className={s.heroTitle}>{companyName}</h1>
          {identity.tagline && <p className={s.heroLead}>{identity.tagline}</p>}
          {wa && <a className={s.heroButton} href={wa} rel="noopener">{t(lang, 'askOnWhatsApp')}</a>}
        </section>
        <section className={s.section}>
          <h2 className={s.sectionTitle}>{t(lang, 'dealsTitle')}</h2>
          <TourGrid {...props} />
        </section>
      </>
    )
  }
  if (page.kind === 'listing') {
    return (
      <section className={s.section}>
        <h1 className={s.sectionTitle}>{t(lang, 'dealsTitle')}</h1>
        <TourGrid {...props} />
      </section>
    )
  }
  if (page.kind === 'tour') {
    const facts = page.tour?.facts ?? null
    const f = facts ? { facts, lang, variant: 'compact' as const, narrative: page.tour?.narrative ?? null } : null
    return (
      <article className={s.section}>
        {page.unpublished && <p className={s.unpublished}>{t(lang, 'notYetPublished')}</p>}
        <TourSections
          sections={transparentValue.tourSections}
          render={{
            hero: () => (
              <header className={s.tourHead}>
                <a className={s.crumb} href={`/${lang}/tours`}>← {t(lang, 'allTours')}</a>
                <h1 className={s.tourTitle}>{page.title}</h1>
                {facts && <TourImage facts={facts} alt={page.title} className={s.tourImage} />}
              </header>
            ),
            price: () => f && <PriceSection {...f} />,
            enquiry: () => wa ? <a className={s.heroButton} href={wa} rel="noopener">{t(lang, 'askOnWhatsApp')}</a> : null,
            inclusions: () => f && <InclusionsSection {...f} />,
            groupSize: () => f && <GroupSizeSection {...f} />,
            departures: () => f && <DeparturesSection {...f} />,
            overview: () => f && <OverviewSection {...f} />,
            highlights: () => f && <HighlightsSection {...f} />,
            itinerary: () => f && <ItinerarySection {...f} />,
            accommodation: () => f && <AccommodationSection {...f} />,
            terms: () => f && <CancellationSection {...f} />,
          }}
        />
      </article>
    )
  }
  return (
    <section className={s.section}>
      <h1 className={s.sectionTitle}>{page.title}</h1>
    </section>
  )
}

export const transparentValue: Theme = {
  archetype: 'transparent_value',
  label: 'Transparent value',
  description: 'Clear prices first. A price-led tour grid, inclusions up front, WhatsApp to ask.',
  // Price and what it buys above the fold; the story after.
  tourSections: ['hero', 'price', 'enquiry', 'inclusions', 'groupSize', 'departures', 'highlights', 'itinerary', 'accommodation', 'overview', 'terms'],
  Frame,
  Page,
}
