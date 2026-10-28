'use client'

// ============================================
// Publish — one tour page: review, approve, publish
// ============================================
// docs/publish/PLAN.md §10. Per language: the tour's facts as the page shows
// them (live from the records), and its written parts — overview,
// highlights, day narratives, search title/description, and in the second
// language the tour's own wording translated from the records (held to a
// faithfulness check: the same numbers, prices and dates). For each part, ask
// the engine for a draft, edit it (every edit is held to the same check as
// the engine: no number, price, date or policy outside a fact slot), and a
// manager approves it — which publishes a new version — or rejects it with a
// note that becomes the next draft's instruction. Facts never wait for any
// of this; approved text that the records have overtaken is withheld from
// the page until a new draft is approved.

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Sparkles, Check, X, Save, AlertTriangle, Globe, History, Flag } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { showToast } from '@/app/contexts/ToastContext'

type Seg = { type: 'text'; text: string; sources?: string[] } | { type: 'slot'; slot: string }
type Content =
  | { kind: 'overview'; segments: Seg[] }
  | { kind: 'highlights'; items: Seg[][] }
  | { kind: 'days'; days: Array<{ day: number; segments: Seg[] }> }
  | { kind: 'seo'; title: string; description: string }
  | { kind: 'labels'; items: Array<{ source: string; text: string }> }
type Part = Content['kind']
interface Check { ok: boolean; violations: Array<{ rule: string; match: string; segment?: number }>; flags: Array<{ match: string }>; notes?: string[] }
interface Draft { id: string; kind: string; content: Content & { empty?: true }; check_result: Check | null; status: string; origin: string; reviewer_note: string | null; created_at: string }
interface Detail {
  page: { id: string; kind: string; tourName: string; languages: string[] }
  locale: { id: string; language: string; slug: string; is_published: boolean; current_version_id: string | null }
  facts: null | { days: Array<{ day: number; title: string | null; city: string | null }>; publishable: { ok: boolean; reasons: string[] }; price: { status: string } }
  rate: null | RateView
  narrative: { overview: Seg[] | null; highlights: Seg[][] | null; days: Array<{ day: number }>; seo: unknown; labels?: Record<string, string>; stale: string[] }
  drafts: Draft[]
  versions: Array<{ id: string; version_no: number; reason: string; approver_name: string | null; approved_at: string }>
}

type Band = { minPax: number; maxPax: number; perPerson: number }
interface RateView {
  proposal: { currency: string; tier: string | null; tierLabel: string | null; range: { min: number; max: number } | null; bands: Band[]; missing: number[]; reasons: string[] }
  saved: { tier: string; currency: string; bands: Band[]; approvedAt: string | null; approverName: string | null } | null
  status: 'none' | 'in_step' | 'changed'
}

const LANGUAGE_NAME: Record<string, string> = { fr: 'French', es: 'Spanish' }

const PARTS: Array<{ part: Part; label: string; help: string }> = [
  // Second language only: the tour's own wording from the records, translated.
  { part: 'labels', label: 'Tour wording in this language', help: 'The tour name, day titles, sights, highlights and what is included — translated from your records. Numbers, prices and dates must stay exactly as they are.' },
  { part: 'overview', label: 'Overview', help: 'Two short paragraphs at the top of the page.' },
  { part: 'highlights', label: 'Highlights', help: 'Three to six short lines.' },
  { part: 'days', label: 'Day by day', help: 'A few sentences under each day of the itinerary.' },
  { part: 'seo', label: 'Search title and description', help: 'What search engines show.' },
]
const SLOT_LABEL: Record<string, string> = {
  price_from: 'price from', duration: 'duration', group_size: 'group size',
  departure_days: 'departure days', next_departure: 'next departure', cancellation: 'cancellation terms',
}
const OPEN = ['draft', 'in_review', 'failed_check']
const STATUS: Record<string, { label: string; tone: string }> = {
  in_review: { label: 'Ready for review', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  failed_check: { label: 'States a fact — fix before approving', tone: 'bg-red-50 text-red-700 border-red-200' },
  draft: { label: 'Draft', tone: 'bg-gray-50 text-gray-700 border-gray-200' },
  rejected: { label: 'Rejected', tone: 'bg-gray-50 text-gray-600 border-gray-200' },
}
// For translated wording: what the faithfulness check found changed.
const LABEL_RULE: Record<string, string> = {
  digit: 'its numbers differ from the original', currency: 'its price or currency differs', number_word: 'a number was added or dropped',
  date: 'its dates or weekdays differ',
}

const RULE: Record<string, string> = {
  digit: 'a number', roman_numeral: 'a Roman numeral', number_word: 'a number in words', currency: 'a price or currency',
  date: 'a date or schedule', policy: 'a price, policy or promise word',
}

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
  if (!json.success) throw new Error(json.error || 'Something went wrong')
  return json.data
}

function SegmentsEditor({ segments, onChange }: { segments: Seg[]; onChange: (s: Seg[]) => void }) {
  return (
    <div className="space-y-2">
      {segments.map((s, i) => s.type === 'slot' ? (
        <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[#647C47]/10 text-[#647C47] mr-2" title="Filled from your records when the page is shown">
          [{SLOT_LABEL[s.slot] ?? s.slot}]
          <button type="button" aria-label="Remove this fact" onClick={() => onChange(segments.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
        </span>
      ) : (
        <textarea key={i} value={s.text} rows={Math.min(8, Math.max(2, Math.ceil(s.text.length / 90)))}
          onChange={e => onChange(segments.map((x, j) => j === i ? { ...x, text: e.target.value } as Seg : x))}
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47]" />
      ))}
    </div>
  )
}

function ContentEditor({ content, onChange, dayTitles }: { content: Content; onChange: (c: Content) => void; dayTitles: Map<number, string> }) {
  switch (content.kind) {
    case 'overview':
      return <SegmentsEditor segments={content.segments} onChange={segments => onChange({ ...content, segments })} />
    case 'highlights':
      return (
        <ol className="space-y-2 list-decimal pl-5">
          {content.items.map((item, i) => (
            <li key={i}><SegmentsEditor segments={item} onChange={s => onChange({ ...content, items: content.items.map((x, j) => j === i ? s : x) })} /></li>
          ))}
        </ol>
      )
    case 'days':
      return (
        <div className="space-y-3">
          {content.days.map((d, i) => (
            <div key={d.day}>
              <p className="text-xs font-medium text-gray-500 mb-1">Day {d.day}{dayTitles.get(d.day) ? ` — ${dayTitles.get(d.day)}` : ''}</p>
              <SegmentsEditor segments={d.segments} onChange={s => onChange({ ...content, days: content.days.map((x, j) => j === i ? { ...x, segments: s } : x) })} />
            </div>
          ))}
        </div>
      )
    case 'labels':
      return (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-3 font-medium w-2/5">In your records</th><th className="py-1 font-medium">On the page</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {content.items.map((item, i) => (
              <tr key={item.source}>
                <td className="py-1.5 pr-3 text-gray-600 align-top">{item.source}</td>
                <td className="py-1.5">
                  <input value={item.text} aria-label={`Translation of ${item.source}`}
                    onChange={e => onChange({ ...content, items: content.items.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })}
                    className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'seo':
      return (
        <div className="space-y-2">
          <label className="block text-xs text-gray-500">Title ({content.title.length}/60)
            <input value={content.title} onChange={e => onChange({ ...content, title: e.target.value })} className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2" />
          </label>
          <label className="block text-xs text-gray-500">Description ({content.description.length}/155)
            <textarea value={content.description} rows={3} onChange={e => onChange({ ...content, description: e.target.value })} className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2" />
          </label>
        </div>
      )
  }
}

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(n))
const paxLabel = (b: Band) => (b.minPax === b.maxPax ? `${b.minPax}` : `${b.minPax}\u2013${b.maxPax}`)

function BandList({ bands, currency }: { bands: Band[]; currency: string }) {
  return (
    <table className="mt-2 text-sm">
      <thead><tr className="text-left text-gray-500"><th className="pr-6 font-normal">Travellers</th><th className="font-normal">Per person</th></tr></thead>
      <tbody>{bands.map(b => <tr key={b.minPax}><td className="pr-6">{paxLabel(b)}</td><td className="font-medium">{money(b.perPerson, currency)}</td></tr>)}</tbody>
    </table>
  )
}

/** The tour's one public price: today's proposal, what is approved, and approving it. */
function PublicPriceCard({ pageId, rate, canManage, onDone }: { pageId: string; rate: RateView; canManage: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const p = rate.proposal
  const ready = p.reasons.length === 0 && p.bands.length > 0
  async function approve() {
    setBusy(true)
    try {
      const r = await call(`/api/publish/pages/${pageId}/rate`, { method: 'POST', body: JSON.stringify({ bands: p.bands }) })
      showToast('success', r.warning ?? 'Public price published')
      onDone()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed')
      onDone()
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div>
        <h3 className="font-medium text-gray-900">Public price</h3>
        <p className="text-sm text-gray-500">Every visitor sees one price per person for their group size — never a price by nationality. It is worked out from your rates at the higher of the EU and other-nationality figures, for every group size the tour allows, and goes on the website only when you publish it.</p>
      </div>
      {rate.saved && (
        <div className={`text-sm rounded-md border p-3 ${rate.status === 'changed' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
          <p className="font-medium text-gray-900">
            On the website{rate.saved.approvedAt ? ` since ${new Date(rate.saved.approvedAt).toLocaleDateString()}` : ''}{rate.saved.approverName ? `, approved by ${rate.saved.approverName}` : ''}
          </p>
          {rate.status === 'changed' && <p className="text-amber-800 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />Your rates now give a different price. The website keeps the approved one until you publish the new one.</p>}
          {rate.status === 'in_step' && <p className="text-gray-500">In step with your rates.</p>}
          <BandList bands={rate.saved.bands} currency={rate.saved.currency} />
        </div>
      )}
      {rate.status !== 'in_step' && (
        <div className="text-sm">
          <p className="font-medium text-gray-900">{rate.saved ? 'New price from your rates' : 'Price from your rates'}{p.tierLabel ? ` · ${p.tierLabel}` : ''}{p.range ? ` · ${p.range.min}\u2013${p.range.max} travellers` : ''}</p>
          {p.reasons.length > 0
            ? <ul className="mt-1 text-amber-800 list-disc pl-5">{p.reasons.map(r => <li key={r}>{r}</li>)}</ul>
            : <BandList bands={p.bands} currency={p.currency} />}
          {canManage && (
            <button onClick={approve} disabled={busy || !ready} className="mt-3 text-sm px-3 py-1.5 rounded-md bg-[#647C47] text-white disabled:opacity-40">
              {busy ? 'Publishing…' : 'Publish this price'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function PartCard({ part, label, help, detail, canWrite, canManage, onDone }: {
  part: Part; label: string; help: string; detail: Detail; canWrite: boolean; canManage: boolean; onDone: () => void
}) {
  const drafts = detail.drafts.filter(d => d.content?.kind === part)
  const open = drafts.find(d => OPEN.includes(d.status) && !d.content.empty) ?? null
  const lastRejected = drafts.find(d => d.status === 'rejected') ?? null
  const [content, setContent] = useState<Content | null>(open?.content ?? null)
  const [instruction, setInstruction] = useState(lastRejected?.reviewer_note ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { setContent(open?.content ?? null) }, [open?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const live = part === 'overview' ? !!detail.narrative.overview : part === 'highlights' ? !!detail.narrative.highlights
    : part === 'days' ? detail.narrative.days.length > 0 : part === 'labels' ? Object.keys(detail.narrative.labels ?? {}).length > 0
    : !!detail.narrative.seo
  const stale = detail.narrative.stale.filter(s => s === part || (part === 'days' && s.startsWith('day ')))
  const dayTitles = useMemo(() => new Map((detail.facts?.days ?? []).map(d => [d.day, d.title ?? d.city ?? ''])), [detail.facts])
  const dirty = open && content && JSON.stringify(content) !== JSON.stringify(open.content)
  const failedEngine = drafts.find(d => d.status === 'failed_check' && d.content.empty)

  async function run(what: string, f: () => Promise<unknown>, ok: string) {
    setBusy(what)
    try { await f(); showToast('success', ok); onDone() } catch (e) { showToast('error', e instanceof Error ? e.message : 'Failed') } finally { setBusy(null) }
  }
  const draftWithAi = () => run('draft', () => call(`/api/publish/pages/${detail.page.id}/drafts`, { method: 'POST', body: JSON.stringify({ kind: part, language: detail.locale.language, instruction: instruction || null }) }), 'Draft written — review it below')
  const save = () => run('save', () => call(`/api/publish/drafts/${open!.id}`, { method: 'PATCH', body: JSON.stringify({ content }) }), 'Edit saved and checked')
  const approve = () => run('approve', () => call(`/api/publish/drafts/${open!.id}/approve`, { method: 'POST' }), 'Approved — this text is now the published version')
  const reject = () => run('reject', () => call(`/api/publish/drafts/${open!.id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }), 'Rejected — the note will guide the next draft')

  const check = open?.check_result
  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div>
          <h3 className="font-medium text-gray-900">{label}</h3>
          <p className="text-xs text-gray-500">{help}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {live && <span className="px-2 py-1 rounded border bg-green-50 text-green-700 border-green-200">On the page</span>}
          {stale.length > 0 && (part === 'labels'
            ? <span className="px-2 py-1 rounded border bg-amber-50 text-amber-800 border-amber-200" title="Wording in your records has no approved translation yet; the page shows it as written">Some wording not translated</span>
            : <span className="px-2 py-1 rounded border bg-amber-50 text-amber-800 border-amber-200" title="The tour changed since this text was approved">Hidden — out of date ({stale.join(', ')})</span>)}
          {open && <span className={`px-2 py-1 rounded border ${STATUS[open.status]?.tone ?? ''}`}>{part === 'labels' && open.status === 'failed_check' ? 'Changes a fact — fix before approving' : STATUS[open.status]?.label ?? open.status}</span>}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {failedEngine && !open && <p className="text-sm text-red-700">The last draft could not be written: {(failedEngine.check_result?.notes ?? []).join(' ') || 'no usable text came back.'}</p>}
        {open && content ? (
          <>
            <ContentEditor content={content} onChange={setContent} dayTitles={dayTitles} />
            {check && !check.ok && (part === 'labels' ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                <p className="font-medium flex items-center gap-1"><AlertTriangle className="h-4 w-4" />These translations change a fact — keep every number, price and date as in your records:</p>
                <ul className="mt-1 list-disc pl-5">{check.violations.map((v, i) => <li key={i}>{v.match}: {LABEL_RULE[v.rule] ?? v.rule}</li>)}</ul>
              </div>
            ) : (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                <p className="font-medium flex items-center gap-1"><AlertTriangle className="h-4 w-4" />Remove these — facts come from your records, not from the text:</p>
                <ul className="mt-1 list-disc pl-5">{check.violations.map((v, i) => <li key={i}>&ldquo;{v.match}&rdquo; is {RULE[v.rule] ?? v.rule}</li>)}</ul>
              </div>
            ))}
            {check && check.flags.length > 0 && (
              <p className="text-xs text-amber-800 flex items-start gap-1"><Flag className="h-3.5 w-3.5 mt-0.5" />Claims to check before approving: {[...new Set(check.flags.map(f => f.match))].join(', ')}</p>
            )}
            {(check?.notes ?? []).length > 0 && <p className="text-xs text-gray-500">{check!.notes!.join(' ')}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {canWrite && <button onClick={save} disabled={!dirty || busy !== null} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-40"><Save className="h-4 w-4" />Save and check</button>}
              {canManage && <button onClick={approve} disabled={!!dirty || open.status !== 'in_review' || busy !== null} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-[#647C47] text-white disabled:opacity-40" title={dirty ? 'Save your edit first' : undefined}><Check className="h-4 w-4" />Approve and publish this text</button>}
              {canManage && (
                <span className="inline-flex items-center gap-1">
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="What should change?" className="text-sm border border-gray-300 rounded-md px-2 py-1.5 w-56" />
                  <button onClick={reject} disabled={note.trim().length < 3 || busy !== null} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-40"><X className="h-4 w-4" />Reject</button>
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">{part === 'labels'
            ? (live ? 'The approved translation is on the page.' : 'Not translated yet — the page shows the tour\'s wording as it is in your records.')
            : (live ? 'The published text is on the page.' : 'No text yet — the page shows the tour\'s facts here.')}</p>
        )}
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <input value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Optional: guidance for the writer" className="text-sm border border-gray-300 rounded-md px-2 py-1.5 flex-1 min-w-[200px]" />
            <button onClick={draftWithAi} disabled={busy !== null} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-[#647C47] text-[#647C47] disabled:opacity-40">
              <Sparkles className="h-4 w-4" />{busy === 'draft' ? 'Writing…' : part === 'labels' ? (open || live ? 'Translate again' : 'Translate with AI') : open || live ? 'Draft again' : 'Draft with AI'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

export default function PublishPageReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const search = useSearchParams()
  const { isAdmin, isManager, isViewer } = useRole()
  const canManage = isAdmin || isManager
  const canWrite = !isViewer
  const [lang, setLang] = useState(search.get('lang') ?? 'en')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDetail(await call(`/api/publish/pages/${id}?lang=${lang}`))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the page')
    } finally {
      setLoading(false)
    }
  }, [id, lang])
  useEffect(() => { load() }, [load])

  async function togglePublished() {
    if (!detail) return
    try {
      const r = await call(`/api/publish/locales/${detail.locale.id}/publish`, { method: 'POST', body: JSON.stringify({ published: !detail.locale.is_published }) })
      showToast(r.warning ? 'warning' : 'success', r.warning ?? (r.published ? 'Published' : 'Unpublished'))
      load()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed')
    }
  }

  if (loading && !detail) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]" /></div>
  if (error && !detail) return <div className="p-6"><Link href="/publish" className="text-sm text-[#647C47]">← Website</Link><p className="mt-4 text-sm text-red-700">{error}</p></div>
  if (!detail) return null

  const f = detail.facts
  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <Link href="/publish" className="inline-flex items-center gap-1 text-sm text-[#647C47]"><ArrowLeft className="h-4 w-4" />Website</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{detail.page.tourName}</h1>
          <p className="text-sm text-gray-500 flex items-center gap-1"><Globe className="h-4 w-4" />/{detail.locale.language}/tours/{detail.locale.slug}</p>
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-md p-0.5">
          {detail.page.languages.map(l => (
            <button key={l} onClick={() => setLang(l)} className={`text-sm px-3 py-1 rounded ${l === lang ? 'bg-[#647C47] text-white' : 'text-gray-600'}`}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-gray-900">{detail.locale.is_published ? 'Published in this language' : 'Not published in this language'}</p>
          {f && !f.publishable.ok
            ? <ul className="mt-1 text-amber-800 list-disc pl-5">{f.publishable.reasons.map(r => <li key={r}>{r}</li>)}</ul>
            : <p className="text-gray-500">Facts and terms come straight from your records; the price is the public price you published.</p>}
        </div>
        {canManage && (
          <button onClick={togglePublished} disabled={!detail.locale.is_published && !!f && !f.publishable.ok}
            className={`text-sm px-3 py-1.5 rounded-md disabled:opacity-40 ${detail.locale.is_published ? 'border border-gray-300' : 'bg-[#647C47] text-white'}`}>
            {detail.locale.is_published ? 'Unpublish' : 'Publish this page'}
          </button>
        )}
      </section>

      {detail.rate && <PublicPriceCard pageId={detail.page.id} rate={detail.rate} canManage={canManage} onDone={load} />}

      {PARTS.filter(p => p.part !== 'labels' || lang !== 'en').map(p => (
        <PartCard key={`${p.part}-${lang}`} {...p} label={p.part === 'labels' ? `Tour wording in ${LANGUAGE_NAME[lang] ?? lang.toUpperCase()}` : p.label}
          detail={detail} canWrite={canWrite} canManage={canManage} onDone={load} />
      ))}

      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 flex items-center gap-1"><History className="h-4 w-4" />Published versions</h3>
        {detail.versions.length === 0 ? <p className="mt-2 text-sm text-gray-500">None yet.</p> : (
          <ul className="mt-2 text-sm divide-y divide-gray-100">
            {detail.versions.map(v => (
              <li key={v.id} className="py-1.5 flex justify-between gap-3">
                <span>Version {v.version_no}{v.id === detail.locale.current_version_id ? ' · current' : ''}</span>
                <span className="text-gray-500">{v.reason === 'approved_draft' ? `approved by ${v.approver_name ?? 'a team member'}` : v.reason.replace('_', ' ')} · {new Date(v.approved_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
