// The Contact page's form (board 12): who, when, how many, what interests
// them, and their consent to be contacted. A plain HTML form like the tour
// page's (blocks/EnquiryForm.tsx) — no script, no cookies — posted to
// /api/enquire, which answers with the same #enquiry-… anchors. The country
// is asked so a planner knows where the visitor comes from; it is never used
// for a price (one public price per tour, brief 2026-10-28).

import type { PagePayload } from '@/lib/publish/contract'
import { fill, t } from '../../i18n/strings'
import s from './theme.module.css'

/** The countries most travellers come from; anything else is "Other". */
const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'CH', 'AT', 'PT', 'IE', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'GR', 'CA', 'AU', 'NZ',
  'JP', 'CN', 'KR', 'IN', 'SG', 'MY', 'AE', 'SA', 'BR', 'MX', 'AR', 'ZA', 'RU', 'TR']

export function ContactForm({ page }: { page: PagePayload }) {
  const lang = page.language
  const { identity, companyName } = page.site
  const local = new Intl.DisplayNames([lang], { type: 'region' })
  const english = new Intl.DisplayNames(['en'], { type: 'region' })
  // Stored in English (the CRM's language), shown in the visitor's.
  const countries = COUNTRIES.map(c => ({ value: english.of(c) ?? c, label: local.of(c) ?? c })).sort((a, b) => a.label.localeCompare(b.label, lang))
  const interests = page.interests ?? []
  return (
    <section className={s.contactFormBox} id="enquire">
      <p id="enquiry-sent" className={s.notice} role="status">{t(lang, 'enquirySent')}</p>
      <p id="enquiry-slow" className={s.notice} role="alert">{t(lang, 'enquirySlow')}</p>
      <p id="enquiry-invalid" className={s.notice} role="alert">{t(lang, 'enquiryInvalid')}</p>
      <p id="enquiry-failed" className={s.notice} role="alert">{t(lang, 'enquiryFailed')}</p>
      <form method="post" action="/api/enquire" className={s.cForm}>
        <input type="hidden" name="lang" value={lang} />
        {page.pageId && <input type="hidden" name="page" value={page.pageId} />}
        {/* Left empty by people; bots fill it in. */}
        <div className={s.trap} aria-hidden="true"><label>Website <input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <div className={s.cRow}>
          <label>{t(lang, 'yourName')}<input name="name" required maxLength={120} autoComplete="name" /></label>
          <label>{t(lang, 'yourEmail')}<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
        </div>
        <div className={s.cRow}>
          <label>{t(lang, 'whatsappNumber')}<span className={s.cHint}>{t(lang, 'optionalFaster')}</span>
            <input name="whatsapp" type="tel" maxLength={40} autoComplete="tel" /></label>
          <label>{t(lang, 'countryFrom')}
            <select name="country" defaultValue="">
              <option value="">{t(lang, 'choose')}</option>
              {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              <option value="Other">{t(lang, 'otherCountry')}</option>
            </select>
          </label>
        </div>
        <div className={s.cRow}>
          <label>{t(lang, 'arrivalDate')}<input id="enq-date" name="travel_date" type="date" /></label>
          <label>{t(lang, 'nightsLabel')}<input name="nights" type="number" min={1} max={90} inputMode="numeric" /></label>
        </div>
        <div className={s.cRow}>
          <label>{t(lang, 'adultsLabel')}<input name="adults" type="number" min={1} max={99} inputMode="numeric" defaultValue={2} /></label>
          <label>{t(lang, 'childrenLabel')}<input name="children" type="number" min={0} max={99} inputMode="numeric" defaultValue={0} /></label>
        </div>
        {interests.length > 0 && (
          <fieldset className={s.cChips}>
            <legend>{t(lang, 'interestsLabel')} <span className={s.cHint}>{t(lang, 'pickAny')}</span></legend>
            {interests.map(x => (
              <label key={x} className={s.cChip}><input type="checkbox" name="interests" value={x} /><span>{x}</span></label>
            ))}
          </fieldset>
        )}
        <label>{t(lang, 'anythingElse')}<span className={s.cHint}>{t(lang, 'optionalWord')}</span>
          <textarea name="message" rows={4} maxLength={4000} placeholder={t(lang, 'anythingElseHint')} /></label>
        <label className={s.cConsent}>
          <input type="checkbox" name="consent" value="yes" required />
          <span>
            {fill(lang, 'consentText', { company: companyName })}
            {identity.privacyUrl && <> <a href={identity.privacyUrl}>{t(lang, 'privacyPolicy')}</a></>}
          </span>
        </label>
        <div className={s.cActions}>
          <button type="submit" className={s.pillDark}>{t(lang, 'sendRequest')}</button>
          <span className={s.cHint}>{t(lang, 'noPaymentNeeded')}</span>
        </div>
      </form>
    </section>
  )
}
