// The agency's Google reviews (lib/publish/reviews.ts) — real reviews only,
// shown as Google gives them. Google's display rules, kept here:
//   · each review credits its author (photo, name, link) and links to itself
//     on Google Maps; text is never edited;
//   · a translated review says so, and its original is one click away;
//   · "Google Maps" attribution, set apart from the agency's own content;
//   · visitors are told that Google does not verify reviews.

/* eslint-disable @next/next/no-img-element -- Google's author photos; sized by CSS */

import type { PagePayload } from '@/lib/publish/contract'
import { t } from '../../i18n/strings'
import s from './reviews.module.css'

const POLICY = 'https://support.google.com/contributionpolicy/answer/7400114'

function Stars({ rating, label }: { rating: number; label: string }) {
  const full = Math.round(rating)
  return <span className={s.stars} role="img" aria-label={label}>{'★'.repeat(full)}<span className={s.starsOff}>{'★'.repeat(5 - full)}</span></span>
}

export function Reviews({ page }: { page: PagePayload }) {
  const r = page.reviews
  if (!r || (r.reviews.length === 0 && r.rating === null)) return null
  const lang = page.language
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  return (
    <section className={s.reviews} aria-labelledby="reviews-title">
      <div className={s.head}>
        <h2 id="reviews-title" className={s.title}>{t(lang, 'reviewsTitle')}</h2>
        {r.rating !== null && (
          <p className={s.summary}>
            <strong>{nf.format(r.rating)}</strong> <Stars rating={r.rating} label={`${nf.format(r.rating)} / 5`} />
            {r.count !== null && <span> · {new Intl.NumberFormat(lang).format(r.count)} {t(lang, 'reviewsOnGoogle')}</span>}
          </p>
        )}
      </div>
      {r.reviews.length > 0 && (
        <ul className={s.list}>
          {r.reviews.map((x, i) => (
            <li key={`${x.author}-${i}`} className={s.card}>
              <div className={s.author}>
                {x.authorPhoto && <img src={x.authorPhoto} alt="" className={s.photo} loading="lazy" referrerPolicy="no-referrer" width={36} height={36} />}
                <div>
                  {x.authorUrl ? <a href={x.authorUrl} rel="nofollow noopener" target="_blank">{x.author}</a> : <span>{x.author}</span>}
                  <p className={s.meta}><Stars rating={x.rating} label={`${x.rating} / 5`} /> {x.when}</p>
                </div>
              </div>
              <p className={s.text}>{x.text}</p>
              <p className={s.meta}>
                {x.translated && <span>{t(lang, 'translatedByGoogle')} · </span>}
                {x.url && <a href={x.url} rel="nofollow noopener" target="_blank">{x.translated ? t(lang, 'seeOriginal') : t(lang, 'onGoogleMaps')}</a>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className={s.attribution}>
        {r.url ? <a href={r.url} rel="nofollow noopener" target="_blank">Google Maps</a> : 'Google Maps'}
        {' · '}{t(lang, 'reviewsNotVerified')} <a href={POLICY} rel="nofollow noopener" target="_blank">{t(lang, 'reviewsPolicy')}</a>
      </p>
    </section>
  )
}
