// ============================================
// Publish — the whole website as one download (step 12, PLAN §14)
// ============================================
// A company can take its website anywhere: one zip with
//   pages/{lang}/{path}.html  the pages as served, standalone — stylesheets
//                             and fonts bundled under assets/, scripts removed
//                             (every page is drawn on the server, so it reads
//                             the same), links between pages made relative;
//   pages/{lang}/{path}.md    each page's approved text and facts as Markdown;
//   media/ + media.csv        the company's uploaded photos and their alt text;
//   redirects.csv, _redirects (Netlify/Cloudflare), nginx.conf;
//   leads.csv                 its website enquiries with the lead's contact;
//   site.json                 theme, brand, languages, glossary, page tree.
// Prices and facts are as they are today: the export is a snapshot.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PagePayload } from './contract'
import { narrativeText, paragraphs } from '../../sites/themes/blocks/narrative'
import { formatPrice, formatWeekdays } from '../../sites/themes/blocks/format'

export interface ExportDeps {
  /** One page's payload (lib/publish/site-data loadPagePayload, published only). */
  page: (input: { siteId: string; language: string; path: string }) => Promise<PagePayload | null>
  /** The page as served at a URL; null when it could not be fetched. */
  fetchText: (url: string) => Promise<string | null>
  fetchBytes: (url: string) => Promise<Uint8Array | null>
  /** An uploaded photo from the publish-media bucket. */
  media: (storagePath: string) => Promise<Uint8Array | null>
  now: () => Date
}

type Row = Record<string, unknown>

// ---------- small writers ----------

export function csv(rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    // A leading = + - @ would run as a formula in a spreadsheet.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n'
}

/** pages/en/tours/giza.html for 'tours/giza'; pages/en/index.html for the home page. */
export const pageFile = (lang: string, path: string, ext: 'html' | 'md') => `pages/${lang}/${path || 'index'}.${ext}`

/** From a page file back to the zip's root ("../../"). */
const toRoot = (file: string) => '../'.repeat(file.split('/').length - 1)

export function redirectFiles(redirects: Array<{ from: string; to: string; status: number }>) {
  return {
    'redirects.csv': csv([['from', 'to', 'status'], ...redirects.map(r => [r.from, r.to, r.status])]),
    '_redirects': redirects.map(r => `${r.from} ${r.to} ${r.status}`).join('\n') + (redirects.length ? '\n' : ''),
    'nginx.conf': redirects.map(r => `location = ${r.from} { return ${r.status} ${r.to}; }`).join('\n') + (redirects.length ? '\n' : ''),
  }
}

/** A page's approved text and facts as Markdown with front matter. */
export function pageMarkdown(page: PagePayload): string {
  const lang = page.language
  const facts = page.tour?.facts ?? null
  const narrative = page.tour?.narrative ?? null
  const front = [
    '---',
    `title: ${JSON.stringify(page.title)}`,
    `language: ${lang}`,
    `path: ${JSON.stringify(`/${lang}${page.path ? `/${page.path}` : ''}`)}`,
    `kind: ${page.kind}`,
    ...(facts?.price.status === 'available' && facts.price.from
      ? [`price_from: ${JSON.stringify(formatPrice(facts.price.from.perPerson, facts.price.currency, lang))}`, `price_basis: "per person, 2 sharing, lowest season"`]
      : facts ? ['price_from: "on request"'] : []),
    '---',
    '',
    `# ${page.title}`,
    '',
  ]
  const body: string[] = []
  const overview = narrativeText(narrative?.overview, facts, lang)
  if (overview) body.push(...paragraphs(overview), '')
  const highlights = (narrative?.highlights ?? []).map(h => narrativeText(h, facts, lang)).filter((h): h is string => !!h)
  const hl = highlights.length ? highlights : facts?.highlights ?? []
  if (hl.length) body.push('## Highlights', '', ...hl.map(h => `- ${h}`), '')
  if (facts?.days.length) {
    body.push('## Itinerary', '')
    const dayText = new Map((narrative?.days ?? []).map(d => [d.day, narrativeText(d.segments, facts, lang)]))
    for (const d of facts.days) {
      body.push(`### Day ${d.day}${d.title ? ` — ${d.title}` : d.city ? ` — ${d.city}` : ''}`, '')
      if (dayText.get(d.day)) body.push(dayText.get(d.day)!, '')
      if (d.sights.length) body.push(`Visits: ${d.sights.join(', ')}`, '')
    }
  }
  if (facts?.inclusions.length) body.push('## Included', '', ...facts.inclusions.map(i => `- ${i}`), '')
  if (facts?.exclusions.length) body.push('## Not included', '', ...facts.exclusions.map(i => `- ${i}`), '')
  if (facts?.departureDays.length) body.push(`Departs: ${formatWeekdays(facts.departureDays, lang)}`, '')
  if (page.tours.length) body.push('## Tours', '', ...page.tours.map(t => `- [${t.title}](/${lang}/${t.path})`), '')
  return [...front, ...body].join('\n')
}

/** The page as served, made standalone: scripts out, stylesheets and their
 *  fonts into assets/, links between pages relative. */
export async function standaloneHtml(
  html: string, file: string, origin: string, languages: string[], deps: Pick<ExportDeps, 'fetchText' | 'fetchBytes'>, assets: Map<string, Uint8Array | string>,
): Promise<string> {
  const root = toRoot(file)
  let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*rel="(?:preload|modulepreload)"[^>]*>/gi, '')
  // Stylesheets → assets/, with the fonts they load.
  for (const m of [...out.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="(\/[^"]+\.css)"[^>]*>/gi)]) {
    const href = m[1]
    const name = `assets/${href.split('/').pop()}`
    if (!assets.has(name)) {
      let css = await deps.fetchText(`${origin}${href}`)
      if (css === null) continue
      for (const f of [...css.matchAll(/url\((\/_next\/static\/media\/[^)]+)\)/g)]) {
        const font = `assets/${f[1].split('/').pop()}`
        if (!assets.has(font)) { const bytes = await deps.fetchBytes(`${origin}${f[1]}`); if (bytes) assets.set(font, bytes) }
        css = css.split(f[1]).join(f[1].split('/').pop()!)
      }
      assets.set(name, css)
    }
    out = out.split(`href="${href}"`).join(`href="${root}${name}"`)
  }
  // Links between the site's pages → the exported files.
  out = out.replace(/href="\/([a-z]{2})(\/[^"#?]*)?([#?][^"]*)?"/g, (whole, lang: string, rest: string | undefined, tail: string | undefined) => {
    if (!languages.includes(lang)) return whole
    const path = (rest ?? '').replace(/^\/|\/$/g, '')
    return `href="${root}${pageFile(lang, path, 'html')}${tail?.startsWith('#') ? tail : ''}"`
  })
  // The icon and anything else on the site's own host stay reachable.
  return out.replace(/(href|src)="\/(icon\.svg|favicon\.ico)"/g, `$1="${origin}/$2"`)
}

// ---------- the export ----------

export async function buildSiteExport(db: SupabaseClient, tenantId: string, deps: ExportDeps): Promise<{ zip: Uint8Array; filename: string; counts: Record<string, number> }> {
  const read = async <T>(what: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
    const { data, error } = await q
    if (error) throw new Error(`reading ${what}: ${error.message}`)
    return (data ?? ([] as unknown)) as T
  }
  const site = await read<Row | null>('the site', db.from('publish_sites')
    .select('id, archetype, status, languages, brand, settings, tenants(company_name)').eq('tenant_id', tenantId).maybeSingle())
  if (!site) throw new Error('This company has no website yet.')
  const siteId = site.id as string
  const languages = site.languages as string[]
  const companyName = ((site.tenants as { company_name?: string } | null)?.company_name ?? 'website')

  const [domains, glossary, redirects, locales, media, enquiries] = await Promise.all([
    read<Row[]>('domains', db.from('publish_domains').select('hostname, kind, status').eq('site_id', siteId)),
    read<Row[]>('the glossary', db.from('publish_glossary').select('term_key, kind, language, spelling').eq('tenant_id', tenantId)),
    read<Row[]>('redirects', db.from('publish_redirects').select('from_path, to_path, status_code').eq('site_id', siteId)),
    read<Row[]>('pages', db.from('publish_page_locales').select('language, slug, is_published, publish_pages(kind, tour_template_id)').eq('site_id', siteId)),
    read<Row[]>('media', db.from('publish_media').select('storage_path, width, height, alt, is_placeholder').eq('site_id', siteId)),
    read<Row[]>('enquiries', db.from('publish_enquiries')
      .select('created_at, source, language, landing_url, campaign, utm, dates, travellers, message, tour_templates(template_name), clients(first_name, last_name, email, phone)')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false })),
  ])

  // Where the pages are served from: the live main address, else a test one.
  const primary = domains.find(d => d.kind === 'primary' && d.status === 'active')
  const test = domains.find(d => d.kind === 'test')
  const host = (site.status === 'live' && primary ? primary.hostname : test?.hostname ?? primary?.hostname) as string | undefined
  const origin = host ? (host.endsWith('.localhost') ? `http://${host}` : `https://${host}`) : null

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const assets = new Map<string, Uint8Array | string>()
  const counts = { pages: 0, html: 0, media: 0, leads: enquiries.length, redirects: redirects.length }
  const tree: Array<{ language: string; path: string; kind: string; title: string }> = []

  for (const lang of languages) {
    // The home page lists the tours and places; each published page once.
    const home = await deps.page({ siteId, language: lang, path: '' })
    const paths = new Set<string>(['', 'tours'])
    for (const l of locales) {
      if (l.language !== lang || !l.is_published) continue
      const kind = (l.publish_pages as { kind?: string } | null)?.kind
      if (kind === 'tour') paths.add(`tours/${l.slug}`)
      else if (kind && kind !== 'home' && kind !== 'listing') paths.add(String(l.slug))
    }
    for (const d of home?.destinations ?? []) paths.add(d.path)

    for (const path of paths) {
      const page = path === '' ? home : await deps.page({ siteId, language: lang, path })
      if (!page) continue
      counts.pages++
      tree.push({ language: lang, path, kind: page.kind, title: page.title })
      zip.file(pageFile(lang, path, 'md'), pageMarkdown(page))
      if (origin) {
        const html = await deps.fetchText(`${origin}/${lang}${path ? `/${path}` : ''}`)
        if (html) {
          zip.file(pageFile(lang, path, 'html'), await standaloneHtml(html, pageFile(lang, path, 'html'), origin, languages, deps, assets))
          counts.html++
        }
      }
    }
  }
  for (const [name, content] of assets) zip.file(name, content)

  const mediaRows: Array<Array<string | number | null>> = [['file', 'width', 'height', ...languages.map(l => `alt_${l}`)]]
  for (const m of media) {
    if (m.is_placeholder) continue
    const path = String(m.storage_path)
    const name = `media/${path.split('/').slice(1).join('/')}`
    const bytes = await deps.media(path)
    if (bytes) { zip.file(name, bytes); counts.media++ }
    const alt = (m.alt ?? {}) as Record<string, string>
    mediaRows.push([name, (m.width as number) ?? null, (m.height as number) ?? null, ...languages.map(l => alt[l] ?? '')])
  }
  zip.file('media.csv', csv(mediaRows))

  const r = redirects.map(x => ({ from: String(x.from_path), to: String(x.to_path), status: Number(x.status_code) }))
  for (const [name, content] of Object.entries(redirectFiles(r))) zip.file(name, content)

  zip.file('leads.csv', csv([
    ['received', 'source', 'language', 'tour', 'name', 'email', 'phone', 'travel_date', 'travellers', 'campaign', 'utm', 'landing_page', 'message'],
    ...enquiries.map(e => {
      const c = (e.clients ?? {}) as { first_name?: string; last_name?: string; email?: string; phone?: string }
      return [String(e.created_at ?? '').slice(0, 19), e.source as string, e.language as string,
        (e.tour_templates as { template_name?: string } | null)?.template_name ?? '',
        [c.first_name, c.last_name].filter(Boolean).join(' '), c.email ?? '', c.phone ?? '',
        (e.dates as { from?: string } | null)?.from ?? '', (e.travellers as number) ?? '', (e.campaign as string) ?? '',
        e.utm && Object.keys(e.utm as object).length ? JSON.stringify(e.utm) : '', (e.landing_url as string) ?? '', (e.message as string) ?? '']
    }),
  ]))

  zip.file('site.json', JSON.stringify({
    exported_at: deps.now().toISOString(),
    company: companyName,
    archetype: site.archetype, status: site.status, languages, brand: site.brand,
    domains: domains.map(d => ({ hostname: d.hostname, kind: d.kind, status: d.status })),
    glossary, pages: tree,
    note: 'Prices and facts are as they were when this was exported; on your Autoura website they stay live.',
  }, null, 2))

  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'website'
  return { zip: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), filename: `${slug}-website-${deps.now().toISOString().slice(0, 10)}.zip`, counts }
}
