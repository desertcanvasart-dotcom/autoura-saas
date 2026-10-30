import type { PagePayload } from '@/lib/publish/contract'
import { languageName, t } from '../../i18n/strings'

/** The language switcher as a small menu: a globe and the page's language
 *  code; opened, the site's languages as real links to separate URLs (PLAN
 *  D14 — never a script toggle). Works without script (details/summary). A
 *  language without this page links to its home page. */
export function LanguageMenu({ page, className, listClassName }: { page: PagePayload; className?: string; listClassName?: string }) {
  if (page.site.languages.length < 2) return null
  return (
    <details className={className}>
      <summary aria-label={t(page.language, 'languages')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </svg>
        <span>{page.language.toUpperCase()}</span>
      </summary>
      <ul className={listClassName}>
        {page.site.languages.map(l => {
          const label = <><span>{languageName(l)}</span><span aria-hidden="true">{l.toUpperCase()}</span></>
          // The page's own language is marked, not linked: it is this page.
          if (l === page.language) return <li key={l}><span aria-current="true" lang={l}>{label}</span></li>
          const alt = page.alternates.find(a => a.language === l)
          const href = `/${l}${alt?.path ? `/${alt.path}` : ''}`
          return <li key={l}><a href={href} hrefLang={l} lang={l}>{label}</a></li>
        })}
      </ul>
    </details>
  )
}
