#!/usr/bin/env node
/**
 * A stand-in for the GetAutoura app's two internal Publish endpoints, for
 * working on the site renderer (sites/) without a database.
 *
 *   node scripts/publish-dev-api.mjs            # listens on :4010
 *   PUBLISH_APP_URL=http://127.0.0.1:4010 PUBLISH_INTERNAL_SECRET=dev-internal npm run sites:dev
 *   open http://sillage.localhost:3001          (browsers resolve *.localhost)
 *
 * Hostnames it knows:
 *   sillage.localhost       a test hostname (preview) of a two-language site
 *   www.sillage.localhost   an alias that 301s to sillage.example
 *   anything else           no site
 *
 * The fixture is shaped by lib/publish/contract.ts — keep it in step.
 */

import http from 'node:http'

const PORT = Number(process.env.PORT || 4010)
const SECRET = process.env.PUBLISH_INTERNAL_SECRET || 'dev-internal'

const TENANT = '00000000-0000-4000-8000-00000000d001'
const SITE = '00000000-0000-4000-8000-00000000d002'
const site = { id: SITE, tenantId: TENANT, archetype: 'private_journeys', status: 'draft', languages: ['en', 'fr'], companyName: 'Sillage Egypte (dev)', brand: {} }

const tours = {
  en: [
    { slug: 'nile-classic', name: 'Classic Nile journey', fr: 'croisiere-classique', published: true },
    { slug: 'cairo-in-depth', name: 'Cairo in depth', fr: 'le-caire', published: false },
  ],
}

function resolution(host) {
  if (host === 'sillage.localhost') {
    return { site, domain: { hostname: host, kind: 'test' }, primaryHost: null, preview: true,
      redirects: [{ from: '/old-nile', to: '/en/tours/nile-classic', status: 301 }] }
  }
  if (host === 'www.sillage.localhost') {
    return { site: { ...site, status: 'live' }, domain: { hostname: host, kind: 'alias_redirect' }, primaryHost: 'sillage.example', preview: false, redirects: [] }
  }
  return null
}

function page(lang, path, preview) {
  if (!site.languages.includes(lang)) return null
  const list = tours.en.filter(t => t.published || preview)
  const links = list.map(t => ({ title: t.name, path: `tours/${lang === 'fr' ? t.fr : t.slug}` }))
  const base = { language: lang, site: { id: SITE, tenantId: TENANT, archetype: site.archetype, companyName: site.companyName, languages: site.languages }, tour: null, tours: [], unpublished: false }
  const other = lang === 'en' ? 'fr' : 'en'
  if (path === '') return { ...base, kind: 'home', path: '', title: site.companyName, alternates: [{ language: other, path: '' }], tours: links }
  if (path === 'tours') return { ...base, kind: 'listing', path: 'tours', title: site.companyName, alternates: [{ language: other, path: 'tours' }], tours: links }
  const m = path.match(/^tours\/([a-z0-9-]+)$/)
  const t = m && list.find(x => (lang === 'fr' ? x.fr : x.slug) === m[1])
  if (!t) return null
  return { ...base, kind: 'tour', path, title: t.name, unpublished: !t.published,
    tour: { templateId: '00000000-0000-4000-8000-00000000d003', name: t.name },
    alternates: [{ language: other, path: `tours/${other === 'fr' ? t.fr : t.slug}` }] }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  // Dev only: rename the company, to watch a revalidation reach a cached page.
  //   curl -X POST 'http://127.0.0.1:4010/dev/company-name?name=New+name'
  if (req.method === 'POST' && url.pathname === '/dev/company-name') {
    site.companyName = url.searchParams.get('name') || site.companyName
    return send(200, { companyName: site.companyName })
  }
  if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { error: 'Unauthorized' })
  if (url.pathname === '/api/publish/internal/site') {
    const r = resolution(url.searchParams.get('host'))
    return r ? send(200, r) : send(404, { error: 'No site for this hostname' })
  }
  if (url.pathname === '/api/publish/internal/page') {
    if (url.searchParams.get('site') !== SITE) return send(404, { error: 'No such page' })
    const p = page(url.searchParams.get('lang'), url.searchParams.get('path') || '', url.searchParams.get('preview') === '1')
    return p ? send(200, p) : send(404, { error: 'No such page' })
  }
  send(404, { error: 'not found' })
}).listen(PORT, () => console.log(`[publish-dev-api] listening on :${PORT}`))
