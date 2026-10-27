// ============================================
// Archetype: Private journeys (modelled on Sillage Egypte)
// ============================================
// Premium, tailor-made trips for European and long-haul travellers. Quiet,
// editorial pages; long-form itineraries; the conversion path is a
// consultation (enquiry, concierge, proposal from Autoura — PLAN §2).
// Colours and faces come from the brand layer; nothing here names a company.

import type { Theme, ThemePageProps } from '../types'
import { BrandMark } from '../blocks/BrandMark'
import { LanguageLinks } from '../blocks/LanguageLinks'
import { TourSections } from '../blocks/TourSections'
import { OverviewSection, AccommodationSection, CancellationSection, DeparturesSection, GroupSizeSection, HighlightsSection, InclusionsSection, ItinerarySection, PriceSection, TourImage } from '../blocks/TourFacts'
import { agencyWebsite, emailHref, phoneHref, whatsappHref } from '../blocks/contact'
import { EnquiryForm } from '../blocks/EnquiryForm'
import { t } from '../../i18n/strings'
import s from './theme.module.css'

function consultationHref(page: ThemePageProps['page']): string | null {
  return emailHref(page.site.identity) ?? whatsappHref(page)
}

function Frame({ page, preview, children }: ThemePageProps & { children: React.ReactNode }) {
  const lang = page.language
  const { identity, companyName } = page.site
  const email = emailHref(identity)
  const phone = phoneHref(identity)
  const wa = whatsappHref(page)
  return (
    <div className={s.page}>
      {preview && <div className={s.preview}>{t(lang, 'previewBanner')}</div>}
      <header className={s.header}>
        <BrandMark page={page} className={s.brand} />
        <nav className={s.nav} aria-label={companyName}>
          {agencyWebsite(page) && <a href={agencyWebsite(page)!.href}>← {agencyWebsite(page)!.label}</a>}
          <a href={`/${lang}/tours`}>{t(lang, 'journeysTitle')}</a>
          <LanguageLinks page={page} className={s.languages} />
        </nav>
      </header>
      <main className={s.main}>{children}</main>
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <p className={s.footerName}>{companyName}</p>
          {identity.tagline && <p className={s.footerTagline}>{identity.tagline}</p>}
          <ul className={s.footerContact}>
            {email && <li><a href={email}>{identity.email}</a></li>}
            {phone && <li><a href={phone}>{identity.phone}</a></li>}
            {wa && <li><a href={wa} rel="nofollow">WhatsApp</a></li>}
            {identity.address && <li>{identity.address}</li>}
          </ul>
          {identity.licenseNumber && <p className={s.licence}>{t(lang, 'licensed')} {identity.licenseNumber}</p>}
        </div>
      </footer>
    </div>
  )
}

function JourneyCards({ page }: ThemePageProps) {
  const lang = page.language
  if (page.tours.length === 0) return <p className={s.empty}>{t(lang, 'noToursYet')}</p>
  return (
    <ul className={s.cards}>
      {page.tours.map(tour => (
        <li key={tour.path} className={s.card}>
          <a href={`/${lang}/${tour.path}`}>
            <span className={s.cardArt} aria-hidden="true">{tour.title.charAt(0)}</span>
            <span className={s.cardTitle}>{tour.title}</span>
            <span className={s.cardMore}>{t(lang, 'viewTour')} →</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function Page(props: ThemePageProps) {
  const { page } = props
  const lang = page.language
  if (page.kind === 'home') {
    const { identity, companyName } = page.site
    return (
      <>
        <section className={s.hero}>
          <p className={s.eyebrow}>{companyName}</p>
          <h1 className={s.heroTitle}>{identity.tagline ?? companyName}</h1>
          {consultationHref(page) && <a className={s.buttonOutline} href={consultationHref(page)!}>{t(lang, 'planYourJourney')}</a>}
        </section>
        <section className={s.section}>
          <h2 className={s.sectionTitle}>{t(lang, 'journeysTitle')}</h2>
          <JourneyCards {...props} />
        </section>
      </>
    )
  }
  if (page.kind === 'listing') {
    return (
      <section className={s.section}>
        <h1 className={s.sectionTitle}>{t(lang, 'journeysTitle')}</h1>
        <JourneyCards {...props} />
      </section>
    )
  }
  if (page.kind === 'tour') {
    const facts = page.tour?.facts ?? null
    const f = facts ? { facts, lang, variant: 'editorial' as const, narrative: page.tour?.narrative ?? null } : null
    return (
      <article className={s.tour}>
        {page.unpublished && <p className={s.unpublished}>{t(lang, 'notYetPublished')}</p>}
        <TourSections
          sections={privateJourneys.tourSections}
          render={{
            hero: () => (
              <header className={s.tourHero}>
                <a className={s.eyebrow} href={`/${lang}/tours`}>{t(lang, 'journeysTitle')}</a>
                <h1 className={s.heroTitle}>{page.title}</h1>
                {facts && <TourImage facts={facts} alt={page.title} className={s.tourImage} />}
              </header>
            ),
            overview: () => f && <OverviewSection {...f} />,
            highlights: () => f && <HighlightsSection {...f} />,
            itinerary: () => f && <ItinerarySection {...f} />,
            accommodation: () => f && <AccommodationSection {...f} />,
            inclusions: () => f && <InclusionsSection {...f} />,
            price: () => f && <PriceSection {...f} />,
            departures: () => f && <DeparturesSection {...f} />,
            groupSize: () => f && <GroupSizeSection {...f} />,
            terms: () => f && <CancellationSection {...f} />,
            enquiry: () => <EnquiryForm page={page} variant="editorial" />,
          }}
        />
      </article>
    )
  }
  if (page.kind === 'destination') {
    return (
      <section className={s.section}>
        <h1 className={s.sectionTitle}>{page.title}</h1>
        <JourneyCards {...props} />
      </section>
    )
  }
  return (
    <section className={s.section}>
      <h1 className={s.sectionTitle}>{page.title}</h1>
      {page.kind === 'contact' && <EnquiryForm page={page} variant="editorial" />}
    </section>
  )
}

export const privateJourneys: Theme = {
  archetype: 'private_journeys',
  label: 'Private journeys',
  description: 'Premium, tailor-made trips. Editorial pages, long-form itineraries, a consultation request.',
  // Story first, price understated and late, the conversation last.
  tourSections: ['hero', 'overview', 'highlights', 'itinerary', 'accommodation', 'inclusions', 'price', 'departures', 'groupSize', 'terms', 'enquiry'],
  Frame,
  Page,
}
