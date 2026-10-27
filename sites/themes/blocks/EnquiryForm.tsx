// The enquiry form (step 8). A plain HTML form — no JavaScript, no cookies —
// posted to /api/enquire, which sends the visitor back to this page at the
// anchor saying how it went (sites/lib/lead-capture.ts). The four notices
// stay hidden until their anchor is the page's target.

import type { PagePayload } from '@/lib/publish/contract'
import { t } from '../../i18n/strings'
import { whatsappHref } from './contact'
import s from './enquiry.module.css'

type Variant = 'editorial' | 'compact'

export function EnquiryForm({ page, variant, showWhatsApp = true }: { page: PagePayload; variant: Variant; showWhatsApp?: boolean }) {
  const lang = page.language
  const wa = showWhatsApp ? whatsappHref(page) : null
  return (
    <section className={`${s.enquiry} ${s[variant]}`} id="enquire">
      <h2>{t(lang, page.kind === 'tour' ? 'enquireTitle' : 'enquireGeneral')}</h2>
      <p id="enquiry-sent" className={`${s.notice} ${s.ok}`} role="status">{t(lang, 'enquirySent')}</p>
      <p id="enquiry-slow" className={s.notice} role="alert">{t(lang, 'enquirySlow')}</p>
      <p id="enquiry-invalid" className={s.notice} role="alert">{t(lang, 'enquiryInvalid')}</p>
      <p id="enquiry-failed" className={s.notice} role="alert">{t(lang, 'enquiryFailed')}</p>
      <form method="post" action="/api/enquire" className={s.form}>
        <input type="hidden" name="lang" value={lang} />
        {page.pageId && <input type="hidden" name="page" value={page.pageId} />}
        {/* Left empty by people; bots fill it in. */}
        <div className={s.trap} aria-hidden="true">
          <label>Website <input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <label>{t(lang, 'yourName')}<input name="name" required maxLength={120} autoComplete="name" /></label>
        <label>{t(lang, 'yourEmail')}<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
        <label>{t(lang, 'yourPhone')}<input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
        <div className={s.row}>
          <label>{t(lang, 'travellersLabel')}<input name="travellers" type="number" min={1} max={99} inputMode="numeric" /></label>
          <label>{t(lang, 'travelMonth')}<input name="travel_date" type="month" /></label>
        </div>
        <label>{t(lang, 'yourMessage')}<textarea name="message" rows={4} maxLength={4000} /></label>
        <button type="submit" className={s.submit}>{t(lang, 'sendEnquiry')}</button>
      </form>
      {wa && <p className={s.alt}><a href={wa} rel="nofollow">{t(lang, 'orWhatsApp')}</a></p>}
    </section>
  )
}
