// ============================================
// Which page a request is for — the renderer's routing, as one pure rule
// ============================================
// The proxy (../proxy.ts) resolves the hostname to a site through the
// GetAutoura app, then asks this function what to do. Kept pure so every
// rule is tested without a server:
//
//   unknown hostname             → plain, unbranded 404 (no company named)
//   alias hostname               → 301 to the primary hostname, same path
//   a redirect the agency set    → its 301/302, before anything else
//   /                            → the visitor's language if the site has
//                                  it (Accept-Language as a first-visit
//                                  hint only — never a script toggle), else
//                                  English
//   /{lang}/…  (a site language) → that page
//   anything else                → the site's own 404
//
// Every page is served from the internal path
//   /s/{tenant}/{site}/{mode}/{lang}/{…path}
// which visitors can never request themselves: every visitor path is
// rewritten, so a typed /s/… is just an unknown page of the site.

import type { SiteResolution } from '@/lib/publish/contract'

export type Mode = 'live' | 'preview'

export type RouteDecision =
  | { type: 'rewrite'; path: string }
  | { type: 'redirect'; location: string; status: 301 | 302 | 307 | 308 }
  | { type: 'unknown-host' }

export const UNKNOWN_HOST_PATH = '/unknown-host'
/** A path no page has: the site's own 404, in the given language. */
export const MISSING_SEGMENT = '__missing'

export function internalPath(site: SiteResolution['site'], mode: Mode, lang: string, rest: string): string {
  const tail = rest.replace(/^\/+|\/+$/g, '')
  return `/s/${site.tenantId}/${site.id}/${mode}/${lang}${tail ? `/${tail}` : ''}`
}

/** The site language the visitor prefers, by Accept-Language q-order. */
export function preferredLanguage(acceptLanguage: string | null, languages: string[]): string {
  const fallback = languages[0] ?? 'en'
  if (!acceptLanguage) return fallback
  const ranked = acceptLanguage.split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      return { lang: tag.trim().slice(0, 2).toLowerCase(), q: q ? Number(q.slice(2)) : 1, i }
    })
    .filter(x => x.lang && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  return ranked.find(x => languages.includes(x.lang))?.lang ?? fallback
}

export function decideRoute(input: {
  pathname: string
  search: string
  acceptLanguage: string | null
  resolution: SiteResolution | null
}): RouteDecision {
  const { resolution: r } = input
  if (!r) return { type: 'unknown-host' }

  if (r.domain.kind === 'alias_redirect') {
    if (!r.primaryHost) return { type: 'unknown-host' }
    return { type: 'redirect', location: `https://${r.primaryHost}${input.pathname}${input.search}`, status: 301 }
  }

  const pathname = input.pathname.length > 1 ? input.pathname.replace(/\/+$/, '') : input.pathname
  const redirect = r.redirects.find(x => x.from === pathname)
  if (redirect) {
    // An internal target keeps the visitor's query string; a full URL is taken as written.
    const location = redirect.to.startsWith('/') ? `${redirect.to}${input.search}` : redirect.to
    return { type: 'redirect', location, status: redirect.status }
  }

  const mode: Mode = r.preview ? 'preview' : 'live'
  const languages = r.site.languages
  if (pathname === '/') {
    return { type: 'redirect', location: `/${preferredLanguage(input.acceptLanguage, languages)}${input.search}`, status: 302 }
  }

  const [, first = '', ...rest] = pathname.split('/')
  if (languages.includes(first)) {
    return { type: 'rewrite', path: internalPath(r.site, mode, first, rest.join('/')) }
  }
  return { type: 'rewrite', path: internalPath(r.site, mode, languages[0] ?? 'en', MISSING_SEGMENT) }
}
