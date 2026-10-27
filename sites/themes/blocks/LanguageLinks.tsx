import type { PagePayload } from '@/lib/publish/contract'
import { languageName, t } from '../../i18n/strings'

/** This page in the site's other languages — real links to separate URLs,
 *  never a script toggle (PLAN D14). A language without this page links to
 *  its home page. */
export function LanguageLinks({ page, className }: { page: PagePayload; className?: string }) {
  const others = page.site.languages.filter(l => l !== page.language)
  if (others.length === 0) return null
  return (
    <nav aria-label={t(page.language, 'languages')} className={className}>
      {others.map(l => {
        const alt = page.alternates.find(a => a.language === l)
        const href = `/${l}${alt?.path ? `/${alt.path}` : ''}`
        return <a key={l} href={href} hrefLang={l} lang={l}>{languageName(l)}</a>
      })}
    </nav>
  )
}
