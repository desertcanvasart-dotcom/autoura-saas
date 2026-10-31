'use client'
// ============================================
// Publish — tours on the agency's own website
// ============================================
// Operator, 2026-10-28: an agency that keeps its own website publishes only
// its tours there. It lists the websites its tours may appear on, and copies
// the code for each block — the tour list, one tour, the enquiry form — into
// its pages (lib/publish/embed.ts). Prices stay live, text stays approved,
// enquiries land in Autoura. Managers change the settings; everyone may look.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Code2, Copy, RefreshCw, Save } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { showToast } from '@/app/contexts/ToastContext'

interface Settings { key: string | null; origins: string[]; languages: string[]; rendererUrl: string | null }
interface Tour { name: string; slugs: Record<string, string>; published: string[] }

function Snippet({ label, help, code }: { label: string; help: string; code: string }) {
  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{help}</p>
        </div>
        <button type="button" onClick={() => navigator.clipboard.writeText(code).then(() => showToast('success', 'Copied'))}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300"><Copy className="h-3.5 w-3.5" />Copy</button>
      </div>
      <pre className="text-xs bg-gray-50 p-3 overflow-x-auto whitespace-pre-wrap break-all">{code}</pre>
    </div>
  )
}

export default function PublishEmbedPage() {
  const { isAdmin, isManager } = useRole()
  const canManage = isAdmin || isManager
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tours, setTours] = useState<Tour[]>([])
  const [originsText, setOriginsText] = useState('')
  const [lang, setLang] = useState('en')
  const [saving, setSaving] = useState(false)
  const [feed, setFeed] = useState<{ exists: boolean; prefix: string | null; createdAt: string | null } | null>(null)
  const [freshKey, setFreshKey] = useState<string | null>(null)

  async function load() {
    const [s, o, fk] = await Promise.all([fetch('/api/publish/embed').then(r => r.json()), fetch('/api/publish/overview').then(r => r.json()), fetch('/api/publish/feed-key').then(r => r.json())])
    if (fk.success) setFeed(fk.data)
    if (!s.success) return showToast('error', s.error)
    setSettings(s.data)
    setOriginsText(s.data.origins.join('\n'))
    if (o.success) {
      setTours((o.data.pages ?? []).filter((p: { kind: string }) => p.kind === 'tour').map((p: { tour_templates: { template_name: string } | null; publish_page_locales: Array<{ language: string; slug: string; is_published: boolean }> }) => ({
        name: p.tour_templates?.template_name ?? '',
        slugs: Object.fromEntries(p.publish_page_locales.map(l => [l.language, l.slug])),
        published: p.publish_page_locales.filter(l => l.is_published).map(l => l.language),
      })))
    }
  }
  useEffect(() => { load() }, [])

  async function save(newKey = false) {
    if (newKey && !confirm('Make a new key? The code already on your website stops working until you replace it.')) return
    setSaving(true)
    try {
      const origins = originsText.split(/[\s,]+/).map(x => x.trim()).filter(Boolean)
      const res = await fetch('/api/publish/embed', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ origins, newKey }) })
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      showToast('success', newKey ? 'New key made — replace the code on your website' : 'Saved')
      await load()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function makeFeedKey() {
    if (feed?.exists && !confirm('Make a new key? The old key stops working at once — your developer must use the new one.')) return
    const j = await fetch('/api/publish/feed-key', { method: 'POST' }).then(r => r.json())
    if (!j.success) return showToast('error', j.error)
    setFreshKey(j.data.key)
    await load()
  }

  const loader = useMemo(() => settings?.key && settings.rendererUrl
    ? `<script src="${settings.rendererUrl.replace(/\/$/, '')}/embed.js" data-key="${settings.key}" data-lang="${lang}" async></script>`
    : null, [settings, lang])

  if (!settings) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]" /></div>

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link href="/publish" className="inline-flex items-center gap-1 text-sm text-[#647C47]"><ArrowLeft className="h-4 w-4" />Website</Link>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center"><Code2 className="h-5 w-5 text-[#647C47]" /></div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">On your own website</h1>
          <p className="text-sm text-gray-500">Show your tours on the website you already have — prices always live from Autoura, enquiries straight into your CRM.</p>
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="font-medium text-gray-900">1. Your websites</h2>
        <p className="text-sm text-gray-600">Your tours will only show on these addresses — nowhere else, even if someone copies the code. One per line, for example <code className="text-xs bg-gray-100 px-1 rounded">https://www.youragency.com</code>.</p>
        <textarea value={originsText} onChange={e => setOriginsText(e.target.value)} rows={3} disabled={!canManage}
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 font-mono" placeholder="https://www.youragency.com" />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => save(false)} disabled={saving}
              className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-[#647C47] text-white disabled:opacity-40"><Save className="h-4 w-4" />{settings.key ? 'Save' : 'Save and make my code'}</button>
            {settings.key && (
              <button type="button" onClick={() => save(true)} disabled={saving}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-40"><RefreshCw className="h-4 w-4" />New key</button>
            )}
          </div>
        )}
      </section>

      {settings.key && settings.origins.length > 0 && loader ? (
        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-gray-900">2. Paste the code</h2>
            <div className="flex items-center gap-1 border border-gray-200 rounded-md p-0.5">
              {settings.languages.map(l => (
                <button key={l} onClick={() => setLang(l)} className={`text-sm px-3 py-1 rounded ${l === lang ? 'bg-[#647C47] text-white' : 'text-gray-600'}`}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <p className="text-sm text-gray-600">Paste this once on each page that shows a block (or once in your website&apos;s footer):</p>
          <Snippet label="The loader" help="Once per page" code={loader} />
          <p className="text-sm text-gray-600">Then put a block wherever it should appear:</p>
          <Snippet label="Your tours" help="All your published tours, with search and prices" code={'<div data-autoura="tours"></div>'} />
          <Snippet label="Enquiry form" help="Enquiries arrive in Autoura as leads, with the page they came from" code={'<div data-autoura="enquire"></div>'} />
          {tours.filter(x => x.published.includes(lang) && x.slugs[lang]).map(x => (
            <Snippet key={x.slugs[lang]} label={x.name} help="This tour's full page: days, map, live prices, enquiry"
              code={`<div data-autoura="tour" data-tour="${x.slugs[lang]}"></div>`} />
          ))}
          {tours.some(x => !x.published.includes(lang)) && (
            <p className="text-xs text-gray-500">Only tours published in {lang.toUpperCase()} can be shown — publish a tour on its page first.</p>
          )}
        </section>
      ) : (
        <p className="text-sm text-gray-500">{settings.rendererUrl ? 'Add your website above and save — your code appears here.' : 'The website renderer is not set up for this installation (PUBLISH_RENDERER_URL).'}</p>
      )}

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="font-medium text-gray-900">For your developer: the data feed</h2>
        <p className="text-sm text-gray-600">If a developer builds your website, they can read your published tours — live prices, facts and approved text — as data. Give them this key; keep it private (it is for their server, not for a web page).</p>
        {freshKey ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">Copy it now — it is shown only once.</p>
            <Snippet label="Feed key" help="Authorization: Bearer <key>" code={freshKey} />
          </div>
        ) : feed?.exists ? (
          <p className="text-sm text-gray-600">A key is in use (starts <span className="font-mono">{feed.prefix}…</span>{feed.createdAt ? `, made ${new Date(feed.createdAt).toLocaleDateString()}` : ''}).</p>
        ) : null}
        {settings.rendererUrl && (
          <Snippet label="Example" help="Your tours, in English" code={`curl -H "Authorization: Bearer <your key>" "${typeof window !== 'undefined' ? window.location.origin : ''}/api/publish/feed/v1/tours?lang=en"`} />
        )}
        {canManage && (
          <button type="button" onClick={makeFeedKey} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-gray-300">
            <RefreshCw className="h-4 w-4" />{feed?.exists ? 'Make a new key' : 'Make a key'}
          </button>
        )}
      </section>
    </div>
  )
}
