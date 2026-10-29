// ============================================
// Publish — the agency's side: pages, drafts, approval, publishing
// ============================================
// docs/publish/PLAN.md §10. Called by the /api/publish/* routes after they
// have signed the caller in and checked the role:
//   writers (owner/admin/manager/member)  draft with the engine, edit drafts
//   managers (owner/admin/manager)        add pages, approve, reject, publish
// Writes use the service role with the company named in every query — the
// same model as RLS (migration 440), which already refuses an approval,
// a version or an engine draft from a signed-in browser.
//
// The rules held here:
//   · nothing AI-written reaches the public without a person's approval; an
//     approval re-runs the post-check on the text as it stands now;
//   · a draft written from facts that have since changed cannot be approved —
//     it would describe a tour that no longer exists; draft again;
//   · a version is never edited: approving makes a new one;
//   · a tour page publishes only if the thin-page rule allows it (D7);
//   · a tour shows ONE public price: the engine proposes it, a manager
//     approves it, and only the approved bands reach the website.

import type { TourFacts } from './contract'
import { checkSegments, type CheckResult, type Segment } from './engine/fact-check'
import { namesFromFacts } from './engine/slots'
import type { EngineContent, DraftResult, PartKind } from './engine/engine'
import { checkTranslation } from './engine/translate'
import { loadTourFacts, stopsOf } from './tour-facts'
import { loadRateProposal, rateStatus, readSavedRate, sameBands, bandSchema, type RateProposal } from './public-rate'
import { aboutOf, homeOf, indicativeCurrenciesOf, legalOf } from './site-data'
import { engineBrand, generateTourDraft, generateTourTranslation } from './engine/generate'
import { factsHash, partSegments, renderableNarrative, toStoredPart, tourFingerprint, withPart, type NarrativeBundle, type RenderableNarrative } from './narrative'
import { publishTags } from './sync/events'
import { ARCHETYPES, ARCHETYPE_DEFAULTS, FONT_PAIRS, PALETTE_PRESETS, resolveBrand, type Archetype } from './brand'
import { MAX_ORIGINS, embedOf, newEmbedKey, normalizeOrigin } from './embed'
import { placeReviews, reviewsSettingsOf, searchPlaces } from './reviews'
import { feedOf, hashFeedKey, newFeedKey } from './feed'
import type { DnsRecord, DomainProvider, DomainState } from './domains/provider'
import { railwayConfigFromEnv, railwayProvider } from './domains/railway'
import { normalizeHost } from './site-data'
import { createRevalidator } from './sync/revalidate'

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export class PublishError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

const fail = (message: string, status = 400): never => { throw new PublishError(message, status) }
const check = (what: string, error: { message: string } | null) => {
  if (error) throw new PublishError(`reading ${what}: ${error.message}`, 500)
}

export interface Actor { tenantId: string; userId: string; name: string }

export interface AdminDeps {
  facts: typeof loadTourFacts
  /** Today's proposal for a tour's public rate. */
  proposal: typeof loadRateProposal
  generate: typeof generateTourDraft
  /** The tour's wording in the page language; defaults to the engine's. */
  translate?: typeof generateTourTranslation
  /** Connects agencies' own domains (step 11); null when not configured. */
  domains?: DomainProvider | null
  revalidate: (tenantId: string, tags: string[]) => Promise<void>
  now: () => Date
}

export const defaultDeps: AdminDeps = {
  facts: loadTourFacts,
  proposal: loadRateProposal,
  generate: generateTourDraft,
  translate: generateTourTranslation,
  domains: (() => { const c = railwayConfigFromEnv(); return c ? railwayProvider(c) : null })(),
  revalidate: (tenantId, tags) => createRevalidator({
    rendererUrl: process.env.PUBLISH_RENDERER_URL, secret: process.env.PUBLISH_REVALIDATE_SECRET,
  })(tenantId, tags),
  now: () => new Date(),
}

/** Tell the renderer; a renderer that is down must not undo an approval. */
async function refresh(deps: AdminDeps, tenantId: string): Promise<string | null> {
  try {
    await deps.revalidate(tenantId, [publishTags.site(tenantId), publishTags.tours(tenantId)])
    return null
  } catch (e) {
    return `Saved; the website will show it within the hour (it could not be refreshed now: ${e instanceof Error ? e.message : e}).`
  }
}

// ---------- the company's site ----------

export async function siteOf(db: Db, tenantId: string) {
  const { data, error } = await db.from('publish_sites')
    .select('id, tenant_id, archetype, status, languages, brand, settings, tenants(company_name)').eq('tenant_id', tenantId).maybeSingle()
  check('the site', error)
  return data as null | {
    id: string; tenant_id: string; archetype: Archetype; status: string
    languages: string[]; brand: Record<string, unknown>; settings: unknown; tenants: { company_name: string } | null
  }
}

export async function overview(db: Db, tenantId: string) {
  const site = await siteOf(db, tenantId)
  if (!site) return { site: null }
  const [health, pages, tours, domains] = await Promise.all([
    db.from('publish_sync_health').select('status, last_success_at, last_error, lag_seconds').eq('tenant_id', tenantId).maybeSingle(),
    db.from('publish_pages').select('id, kind, tour_template_id, tour_templates(template_name, is_active), publish_page_locales(id, language, slug, is_published, current_version_id, published_at)')
      .eq('site_id', site.id).eq('tenant_id', tenantId),
    db.from('tour_templates').select('id, template_name, is_active').eq('tenant_id', tenantId).order('template_name'),
    db.from('publish_domains').select('hostname, kind, status').eq('site_id', site.id),
  ])
  for (const [what, r] of [['sync health', health], ['pages', pages], ['tours', tours], ['domains', domains]] as const) check(what, r.error)
  const paged = new Set((pages.data ?? []).map((p: { tour_template_id: string | null }) => p.tour_template_id).filter(Boolean))
  return {
    site: { id: site.id, archetype: site.archetype, status: site.status, languages: site.languages, companyName: site.tenants?.company_name ?? '' },
    health: health.data,
    domains: domains.data ?? [],
    pages: pages.data ?? [],
    toursWithoutPage: (tours.data ?? []).filter((t: { id: string; is_active: boolean | null }) => !paged.has(t.id) && t.is_active !== false),
  }
}

// ---------- pages ----------

export function slugify(name: string): string {
  const s = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '')
  return s || 'tour'
}

export async function createTourPage(db: Db, actor: Actor, templateId: string) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const { data: tour, error } = await db.from('tour_templates').select('id, template_name')
    .eq('id', templateId).eq('tenant_id', actor.tenantId).maybeSingle()
  check('the tour', error)
  if (!tour) fail('No such tour in this company.', 404)

  const { data: page, error: pErr } = await db.from('publish_pages')
    .insert({ tenant_id: actor.tenantId, site_id: site!.id, kind: 'tour', tour_template_id: tour.id }).select('id').single()
  if (pErr) fail(/publish_pages_one_per_tour/.test(pErr.message) ? 'This tour already has a page.' : `Could not add the page: ${pErr.message}`, /one_per_tour/.test(pErr.message) ? 409 : 500)

  // One slug per language, made unique within the site.
  const { data: taken, error: tErr } = await db.from('publish_page_locales').select('language, slug').eq('site_id', site!.id)
  check('slugs', tErr)
  const base = slugify(tour.template_name)
  const rows = site!.languages.map(language => {
    const used = new Set((taken ?? []).filter((r: { language: string }) => r.language === language).map((r: { slug: string }) => r.slug))
    let slug = base
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
    return { tenant_id: actor.tenantId, site_id: site!.id, page_id: page.id, language, slug, is_published: false }
  })
  const { error: lErr } = await db.from('publish_page_locales').insert(rows)
  if (lErr) fail(`Could not add the page's languages: ${lErr.message}`, 500)
  return { pageId: page.id as string }
}

async function pageOf(db: Db, tenantId: string, pageId: string) {
  const { data, error } = await db.from('publish_pages')
    .select('id, site_id, kind, tour_template_id, public_rate, public_rate_approved_at, public_rate_approver_name, faq, tour_templates(template_name), publish_page_locales(id, language, slug, is_published, current_version_id, published_at)')
    .eq('id', pageId).eq('tenant_id', tenantId).maybeSingle()
  check('the page', error)
  if (!data) fail('No such page in this company.', 404)
  return data as {
    id: string; site_id: string; kind: string; tour_template_id: string | null; tour_templates: { template_name: string } | null
    public_rate: unknown; public_rate_approved_at: string | null; public_rate_approver_name: string | null
    faq: unknown
    publish_page_locales: Array<{ id: string; language: string; slug: string; is_published: boolean; current_version_id: string | null; published_at: string | null }>
  }
}

async function factsFor(db: Db, deps: AdminDeps, tenantId: string, page: { tour_template_id: string | null }, language: string, settings: unknown): Promise<TourFacts | null> {
  if (!page.tour_template_id) return null
  return deps.facts(db, { tenantId, templateId: page.tour_template_id, language, indicativeCurrencies: indicativeCurrenciesOf(settings) })
}

async function currentBundle(db: Db, tenantId: string, versionId: string | null): Promise<NarrativeBundle | null> {
  if (!versionId) return null
  const { data, error } = await db.from('publish_versions').select('content').eq('id', versionId).eq('tenant_id', tenantId).maybeSingle()
  check('the published version', error)
  return (data?.content as NarrativeBundle) ?? null
}

export async function pageDetail(db: Db, actor: Actor, pageId: string, language: string, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const page = await pageOf(db, actor.tenantId, pageId)
  const locale = page.publish_page_locales.find(l => l.language === language) ?? fail(`This page has no ${language} version.`, 404)
  const [facts, rate, details, drafts, versions] = await Promise.all([
    factsFor(db, deps, actor.tenantId, page, language, site!.settings),
    rateOf(db, deps, actor.tenantId, page),
    tourDetailsOf(db, actor.tenantId, page),
    db.from('publish_drafts').select('id, kind, content, check_result, status, origin, model, reviewer_note, reviewed_at, created_at, updated_at')
      .eq('page_id', pageId).eq('tenant_id', actor.tenantId).eq('language', language).order('created_at', { ascending: false }).limit(40),
    db.from('publish_versions').select('id, version_no, reason, approver_name, approved_at, draft_id')
      .eq('page_id', pageId).eq('tenant_id', actor.tenantId).eq('language', language).order('version_no', { ascending: false }).limit(50),
  ])
  check('drafts', drafts.error)
  check('versions', versions.error)
  const tourName = page.tour_templates?.template_name ?? ''
  const bundle = await currentBundle(db, actor.tenantId, locale.current_version_id)
  const narrative: RenderableNarrative = renderableNarrative(bundle, facts, tourName)
  return {
    page: { id: page.id, kind: page.kind, tourName, languages: site!.languages },
    locale,
    locales: page.publish_page_locales,
    facts,
    rate,
    details,
    narrative,
    drafts: drafts.data ?? [],
    versions: versions.data ?? [],
  }
}

// ---------- the details the website template shows (migration 444) ----------

/** Languages a manager can say a tour's guides speak (two-letter codes). */
export const GUIDE_LANGUAGES = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'pl', 'zh', 'ja', 'ko', 'ar'] as const
const MAX_FAQ = 12

interface TourDetails {
  meetingPoint: string | null
  guideLanguages: string[]
  durationHours: number | null
  /** Only a one-day tour has stops with times; null for a longer one. */
  stops: Array<{ time: string | null; name: string }> | null
  faq: Record<string, Array<{ question: string; answer: string }>>
}

async function tourDetailsOf(db: Db, tenantId: string, page: Awaited<ReturnType<typeof pageOf>>): Promise<TourDetails | null> {
  if (!page.tour_template_id) return null
  const { data, error } = await db.from('tour_templates').select('meeting_point, guide_languages, duration_hours, duration_days, itinerary')
    .eq('id', page.tour_template_id).eq('tenant_id', tenantId).maybeSingle()
  check('the tour', error)
  if (!data) return null
  const days = Array.isArray(data.itinerary) ? data.itinerary : []
  const oneDay = (data.duration_days ?? days.length) === 1 && days.length <= 1
  const faq: TourDetails['faq'] = {}
  for (const [lang, list] of Object.entries((page.faq ?? {}) as Record<string, unknown>)) {
    if (Array.isArray(list)) faq[lang] = list.filter((x): x is { question: string; answer: string } => !!x && typeof x.question === 'string' && typeof x.answer === 'string')
  }
  return {
    meetingPoint: data.meeting_point ?? null,
    guideLanguages: data.guide_languages ?? [],
    durationHours: data.duration_hours ?? null,
    stops: oneDay ? stopsOf(days[0]?.stops) : null,
    faq,
  }
}

/**
 * A manager states the tour facts the website shows that no other screen
 * records: where it meets, the guides' languages, a day tour's length in
 * hours and its stops with approximate times. Written to the tour itself;
 * the itinerary is MERGED (only the day's `stops` change) — never rebuilt.
 */
export async function saveTourDetails(db: Db, actor: Actor, pageId: string, input: Record<string, unknown>, deps: AdminDeps = defaultDeps) {
  const page = await pageOf(db, actor.tenantId, pageId)
  if (!page.tour_template_id) fail('Only a tour page has tour details.', 409)
  const { data: tour, error } = await db.from('tour_templates').select('id, duration_days, itinerary')
    .eq('id', page.tour_template_id!).eq('tenant_id', actor.tenantId).maybeSingle()
  check('the tour', error)
  if (!tour) fail('The tour no longer exists.', 404)

  const patch: Record<string, unknown> = {}
  if ('meetingPoint' in input) {
    const v = input.meetingPoint
    if (v !== null && typeof v !== 'string') fail('Say where the tour meets, or leave it empty.')
    patch.meeting_point = typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null
  }
  if ('guideLanguages' in input) {
    const v = input.guideLanguages
    if (!Array.isArray(v) || v.some(c => !(GUIDE_LANGUAGES as readonly string[]).includes(c as string))) fail(`Guide languages must be among: ${GUIDE_LANGUAGES.join(', ')}.`)
    patch.guide_languages = [...new Set(v as string[])]
  }
  if ('durationHours' in input) {
    const v = input.durationHours
    if (v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 24)) fail('A day tour lasts between 1 and 24 hours.')
    // Whole hours, as the tour sheet carries them (a round trip stays exact).
    patch.duration_hours = v === null ? null : Math.round(v as number)
  }
  if ('stops' in input) {
    const days = Array.isArray(tour!.itinerary) ? [...tour!.itinerary as Record<string, unknown>[]] : []
    if ((tour!.duration_days ?? days.length) !== 1 || days.length > 1) fail('Stops with times are for a one-day tour.', 409)
    const raw = input.stops
    if (!Array.isArray(raw) || raw.length > 20) fail('List up to 20 stops.')
    for (const x of raw as unknown[]) {
      const r = (x ?? {}) as { time?: unknown; name?: unknown }
      if (typeof r.name !== 'string' || !r.name.trim()) fail('Every stop needs a name.')
      if (r.time !== null && r.time !== undefined && r.time !== '' && !(typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))) fail(`"${r.time}" is not a time — use HH:MM, or leave it empty.`)
    }
    const stops = stopsOf(raw).map(x => ({ time: x.time, name: x.name.slice(0, 200) }))
    // Merge into the day as stored: every other key of the day is kept.
    days[0] = { ...(days[0] ?? { day: 1 }), stops }
    patch.itinerary = days
  }
  if (Object.keys(patch).length === 0) fail('Nothing to save.')
  const { error: uErr } = await db.from('tour_templates').update(patch).eq('id', tour!.id).eq('tenant_id', actor.tenantId)
  if (uErr) fail(`Could not save the tour details: ${uErr.message}`, 500)
  return { saved: true, warning: await refresh(deps, actor.tenantId) }
}

/** A manager saves the page's questions and answers in one language. What
 *  they save is what the page shows — nothing is written for them. */
export async function savePageFaq(db: Db, actor: Actor, pageId: string, language: unknown, items: unknown, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  if (typeof language !== 'string' || !site!.languages.includes(language)) fail('Choose one of the website\'s languages.')
  const page = await pageOf(db, actor.tenantId, pageId)
  if (!Array.isArray(items) || items.length > MAX_FAQ) fail(`Up to ${MAX_FAQ} questions.`)
  const clean = (items as unknown[]).map(x => {
    const r = (x ?? {}) as { question?: unknown; answer?: unknown }
    const q = typeof r.question === 'string' ? r.question.trim() : ''
    const a = typeof r.answer === 'string' ? r.answer.trim() : ''
    if (!q || !a) fail('Every question needs its answer (and every answer its question).')
    if (q.length > 200 || a.length > 2000) fail('Keep a question under 200 characters and an answer under 2,000.')
    return { question: q, answer: a }
  })
  const faq = { ...((page.faq ?? {}) as Record<string, unknown>), [language as string]: clean }
  const { error } = await db.from('publish_pages').update({ faq }).eq('id', pageId).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not save the questions: ${error.message}`, 500)
  return { saved: true, warning: await refresh(deps, actor.tenantId) }
}

// ---------- the public rate: one price per tour ----------

export interface PublicRateView {
  proposal: RateProposal
  saved: { tier: string; currency: string; bands: Array<{ minPax: number; maxPax: number; perPerson: number }>; approvedAt: string | null; approverName: string | null } | null
  /** none = never approved · in_step = matches today's proposal · changed = the engine's answer moved */
  status: ReturnType<typeof rateStatus>
}

async function rateOf(db: Db, deps: AdminDeps, tenantId: string, page: Awaited<ReturnType<typeof pageOf>>): Promise<PublicRateView | null> {
  if (!page.tour_template_id) return null
  const proposal = await deps.proposal(db, tenantId, page.tour_template_id)
  const saved = readSavedRate(page.public_rate)
  return {
    proposal,
    saved: saved ? { ...saved, approvedAt: page.public_rate_approved_at, approverName: page.public_rate_approver_name } : null,
    status: rateStatus(saved, proposal),
  }
}

/**
 * A manager approves today's proposal as the tour's public rate. The bands
 * they were shown come back with the request: if the engine's answer has
 * moved since, nothing is saved — they must look at the new figures first.
 */
export async function approvePublicRate(db: Db, actor: Actor, pageId: string, shown: unknown, deps: AdminDeps = defaultDeps) {
  const page = await pageOf(db, actor.tenantId, pageId)
  if (!page.tour_template_id) fail('Only a tour page has a price.', 409)
  const parsed = bandSchema.array().safeParse(shown)
  if (!parsed.success) fail('Say which price you approve.')
  const proposal = await deps.proposal(db, actor.tenantId, page.tour_template_id!)
  if (proposal.reasons.length || !proposal.tier || !proposal.bands.length) {
    fail(`This price cannot be published yet: ${proposal.reasons.join(' ')}`, 409)
  }
  if (!sameBands(parsed.data!, proposal.bands)) fail('The price has changed since you opened this page — look at the new figures and approve again.', 409)
  const { error } = await db.from('publish_pages').update({
    public_rate: { tier: proposal.tier, currency: proposal.currency, bands: proposal.bands },
    public_rate_approved_at: deps.now().toISOString(),
    public_rate_approved_by: actor.userId,
    public_rate_approver_name: actor.name,
  }).eq('id', pageId).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not save the price: ${error.message}`, 500)
  return { approved: true, warning: await refresh(deps, actor.tenantId) }
}

// ---------- drafts ----------

const KIND_FOR_PART: Record<PartKind, 'narrative' | 'seo'> = { overview: 'narrative', highlights: 'narrative', days: 'narrative', seo: 'seo', labels: 'narrative' }

/** The open drafts of the same part and language, replaced by a newer one. */
async function supersedeOpen(db: Db, tenantId: string, pageId: string, language: string, part: PartKind, exceptId: string) {
  const { data, error } = await db.from('publish_drafts').select('id, content, status')
    .eq('page_id', pageId).eq('tenant_id', tenantId).eq('language', language).in('status', ['draft', 'in_review', 'failed_check'])
  check('open drafts', error)
  const ids = (data ?? []).filter((d: { id: string; content: { kind?: string } }) => d.id !== exceptId && d.content?.kind === part).map((d: { id: string }) => d.id)
  if (ids.length) {
    const { error: uErr } = await db.from('publish_drafts').update({ status: 'superseded' }).in('id', ids)
    if (uErr) fail(`Could not retire older drafts: ${uErr.message}`, 500)
  }
}

export async function draftWithEngine(db: Db, actor: Actor, pageId: string, input: { language: string; kind: PartKind; instruction?: string | null }, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const page = await pageOf(db, actor.tenantId, pageId)
  if (page.kind !== 'tour') fail('The engine writes tour pages.')
  if (!page.publish_page_locales.some(l => l.language === input.language)) fail(`This page has no ${input.language} version.`, 404)
  if (input.kind === 'labels' && input.language === 'en') fail('The tour\'s records are already in English — there is nothing to translate.')

  const ask = { siteId: site!.id, pageId, language: input.language, instruction: input.instruction ?? null }
  const result: DraftResult & { facts: TourFacts } = input.kind === 'labels'
    ? await (deps.translate ?? generateTourTranslation)(db, ask)
    : await deps.generate(db, { ...ask, kind: input.kind })
  const { data: draft, error } = await db.from('publish_drafts').insert({
    tenant_id: actor.tenantId, page_id: pageId, language: input.language, kind: KIND_FOR_PART[input.kind],
    content: result.content ?? { kind: input.kind, empty: true },
    sources: result.sourcesUsed,
    check_result: { ...result.check, notes: result.notes, attempts: result.attempts },
    status: result.content ? result.status : 'failed_check',
    origin: 'engine', model: result.model || null, prompt_version: result.promptVersion,
    fact_fingerprint: tourFingerprint(result.facts, page.tour_templates?.template_name ?? ''),
    created_by: actor.userId,
  }).select('id, status').single()
  if (error) fail(`Could not save the draft: ${error.message}`, 500)
  await supersedeOpen(db, actor.tenantId, pageId, input.language, input.kind, draft.id)
  return { draftId: draft.id as string, status: draft.status as string, check: result.check, notes: result.notes }
}

type DraftRow = {
  id: string; page_id: string; language: string; kind: string; status: string
  content: EngineContent | { kind: string; empty: true }; fact_fingerprint: string | null
}

async function draftOf(db: Db, tenantId: string, draftId: string): Promise<DraftRow> {
  const { data, error } = await db.from('publish_drafts').select('id, page_id, language, kind, status, content, fact_fingerprint')
    .eq('id', draftId).eq('tenant_id', tenantId).maybeSingle()
  check('the draft', error)
  if (!data) fail('No such draft in this company.', 404)
  return data as DraftRow
}

/** A person's edit of a draft is held to the same rule as the engine. */
export function validEditedContent(kind: string, content: unknown): EngineContent | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>
  const seg = (s: unknown): Segment | null => {
    const r = s as { type?: unknown; text?: unknown; slot?: unknown; sources?: unknown }
    if (r?.type === 'slot' && typeof r.slot === 'string') return { type: 'slot', slot: r.slot }
    if (r?.type === 'text' && typeof r.text === 'string' && r.text.trim()) {
      const sources = Array.isArray(r.sources) ? r.sources.filter((x): x is string => typeof x === 'string') : []
      return { type: 'text', text: r.text.trim().slice(0, 4000), ...(sources.length ? { sources } : {}) }
    }
    return null
  }
  const segs = (v: unknown) => (Array.isArray(v) ? v.map(seg).filter((s): s is Segment => s !== null) : [])
  switch (c.kind) {
    case 'overview': { const s = segs(c.segments); return s.length && kind === 'narrative' ? { kind: 'overview', segments: s } : null }
    case 'highlights': {
      const items = (Array.isArray(c.items) ? c.items : []).map(segs).filter(i => i.length)
      return items.length && kind === 'narrative' ? { kind: 'highlights', items } : null
    }
    case 'days': {
      const days = (Array.isArray(c.days) ? c.days : []).map(d => ({ day: Number((d as { day?: unknown }).day), segments: segs((d as { segments?: unknown }).segments) }))
        .filter(d => Number.isInteger(d.day) && d.day > 0 && d.segments.length)
      return days.length && kind === 'narrative' ? { kind: 'days', days } : null
    }
    case 'seo': {
      const title = typeof c.title === 'string' ? c.title.trim().slice(0, 200) : ''
      const description = typeof c.description === 'string' ? c.description.trim().slice(0, 400) : ''
      return title && description && kind === 'seo' ? { kind: 'seo', title, description } : null
    }
    case 'labels': {
      const items = (Array.isArray(c.items) ? c.items : [])
        .map(i => i as { source?: unknown; text?: unknown })
        .filter(i => typeof i.source === 'string' && typeof i.text === 'string' && i.text.trim())
        .map(i => ({ source: (i.source as string), text: (i.text as string).trim().slice(0, 500) }))
      return items.length && kind === 'narrative' ? { kind: 'labels', items } : null
    }
  }
  return null
}

function checkFor(content: EngineContent, facts: TourFacts | null, language: string, tourName: string, companyName: string, brand: { claims: string[] }, glossary: string[]): CheckResult {
  // Translated wording states facts on purpose: it is held to faithfulness —
  // the same numbers, currencies and dates as the records — not to "no facts".
  if (content.kind === 'labels') return checkTranslation(content.items, language)
  return checkSegments(partSegments(content), {
    language,
    allowedTerms: namesFromFacts(facts, [tourName, companyName, ...glossary]),
    allowedClaims: brand.claims,
  })
}

async function glossaryOf(db: Db, tenantId: string, language: string): Promise<string[]> {
  const { data, error } = await db.from('publish_glossary').select('spelling').eq('tenant_id', tenantId).eq('language', language)
  check('the glossary', error)
  return (data ?? []).map((g: { spelling: string }) => g.spelling)
}

export async function editDraft(db: Db, actor: Actor, draftId: string, content: unknown, deps: AdminDeps = defaultDeps) {
  const draft = await draftOf(db, actor.tenantId, draftId)
  if (!['draft', 'in_review', 'failed_check'].includes(draft.status)) fail('Only an open draft can be edited — approved, rejected and replaced drafts stay as they were.', 409)
  const edited = validEditedContent(draft.kind, content) ?? fail('That is not a draft of this kind (or it is empty).')
  if (draft.content && 'kind' in draft.content && draft.content.kind !== edited!.kind) fail('An edit cannot change which part of the page a draft is.')

  const site = (await siteOf(db, actor.tenantId))!
  const page = await pageOf(db, actor.tenantId, draft.page_id)
  const facts = await factsFor(db, deps, actor.tenantId, page, draft.language, site.settings)
  const result = checkFor(edited!, facts, draft.language, page.tour_templates?.template_name ?? '', site.tenants?.company_name ?? '',
    engineBrand(site.archetype, site.brand), await glossaryOf(db, actor.tenantId, draft.language))
  const { error } = await db.from('publish_drafts').update({
    content: edited, check_result: { ...result, notes: [], edited_by: actor.name },
    status: result.ok ? 'in_review' : 'failed_check', origin: 'user',
  }).eq('id', draftId).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not save the edit: ${error.message}`, 500)
  return { status: result.ok ? 'in_review' : 'failed_check', check: result }
}

// ---------- approval ----------

export async function approveDraft(db: Db, actor: Actor, draftId: string, deps: AdminDeps = defaultDeps) {
  const draft = await draftOf(db, actor.tenantId, draftId)
  if (draft.status !== 'in_review') fail(draft.status === 'failed_check'
    ? (draft.content && 'kind' in draft.content && draft.content.kind === 'labels'
      ? 'A translation here changes a number, price or date — fix the ones the check names, then approve.'
      : 'This draft still states a fact outside a slot — fix the words the check names, then approve.')
    : `A draft that is ${draft.status.replace('_', ' ')} cannot be approved.`, 409)
  const content = (draft.content && 'kind' in draft.content && !('empty' in draft.content)) ? draft.content as EngineContent : fail('The draft has no text.', 409)

  const site = (await siteOf(db, actor.tenantId))!
  const page = await pageOf(db, actor.tenantId, draft.page_id)
  const locale = page.publish_page_locales.find(l => l.language === draft.language) ?? fail('The page has no version in this language.', 404)
  const tourName = page.tour_templates?.template_name ?? ''
  const facts = await factsFor(db, deps, actor.tenantId, page, draft.language, site.settings) ?? fail('Only tour pages have narrative to approve.')

  // The text as it stands now must pass — whoever last touched it.
  const result = checkFor(content!, facts, draft.language, tourName, site.tenants?.company_name ?? '',
    engineBrand(site.archetype, site.brand), await glossaryOf(db, actor.tenantId, draft.language))
  if (!result.ok) {
    await db.from('publish_drafts').update({ status: 'failed_check', check_result: { ...result, notes: [] } }).eq('id', draftId).eq('tenant_id', actor.tenantId)
    fail(content!.kind === 'labels'
      ? 'A translation here changes a number, price or date — it has been sent back for a fix.'
      : 'This draft states a fact outside a slot — it has been sent back for a fix.', 409)
  }
  // Written about a tour that has since changed: it may describe days, sights
  // or hotels that are no longer there.
  if (draft.fact_fingerprint && draft.fact_fingerprint !== tourFingerprint(facts!, tourName)) {
    fail('The tour has changed since this draft was written (its days, sights or where it stays). Draft it again from the tour as it is now.', 409)
  }

  const previous = await currentBundle(db, actor.tenantId, locale!.current_version_id)
  const bundle = withPart(previous, toStoredPart(content!, facts!, tourName))
  const { data: last, error: lErr } = await db.from('publish_versions').select('version_no')
    .eq('page_id', page.id).eq('language', draft.language).order('version_no', { ascending: false }).limit(1).maybeSingle()
  check('the last version', lErr)
  const at = deps.now().toISOString()
  const { data: version, error: vErr } = await db.from('publish_versions').insert({
    tenant_id: actor.tenantId, page_id: page.id, language: draft.language, version_no: (last?.version_no ?? 0) + 1,
    content: bundle,
    // D15: the facts as the page showed them at approval — an audit copy, never read back to render.
    facts_snapshot: { hash: factsHash(facts!), price: facts!.price, inclusions: facts!.inclusions, exclusions: facts!.exclusions,
      groupSize: facts!.groupSize, departureDays: facts!.departureDays, cancellation: facts!.cancellation },
    reason: 'approved_draft', draft_id: draft.id, approved_by: actor.userId, approver_name: actor.name, approved_at: at,
  }).select('id, version_no').single()
  if (vErr) fail(`Could not publish the version: ${vErr.message}`, 500)

  const { error: locErr } = await db.from('publish_page_locales').update({ current_version_id: version.id })
    .eq('id', locale!.id).eq('tenant_id', actor.tenantId)
  if (locErr) fail(`Could not point the page at the new version: ${locErr.message}`, 500)
  const { error: dErr } = await db.from('publish_drafts').update({ status: 'approved', reviewed_by: actor.userId, reviewed_at: at, check_result: { ...result, notes: [] } })
    .eq('id', draft.id).eq('tenant_id', actor.tenantId)
  if (dErr) fail(`Could not mark the draft approved: ${dErr.message}`, 500)
  await supersedeOpen(db, actor.tenantId, page.id, draft.language, content!.kind, draft.id)

  // The tour's name in this language becomes its address in this language —
  // only before the page is published, so no live link ever breaks.
  if (content!.kind === 'labels' && !locale!.is_published) {
    const name = content!.items.find(i => i.source === tourName)?.text
    const slug = name ? slugify(name) : null
    if (slug && slug !== locale!.slug) {
      const { error: sErr } = await db.from('publish_page_locales').update({ slug }).eq('id', locale!.id).eq('tenant_id', actor.tenantId)
      // Taken by another page in this language: keep the address it has.
      if (sErr && !/duplicate|unique/i.test(sErr.message)) fail(`Could not set the page's address: ${sErr.message}`, 500)
    }
  }

  return { versionId: version.id as string, versionNo: version.version_no as number, warning: locale!.is_published ? await refresh(deps, actor.tenantId) : null }
}

export async function rejectDraft(db: Db, actor: Actor, draftId: string, note: string, deps: AdminDeps = defaultDeps) {
  const trimmed = (note ?? '').trim()
  if (trimmed.length < 3) fail('Say what should change — the note becomes the instruction for the next draft.')
  const draft = await draftOf(db, actor.tenantId, draftId)
  if (!['draft', 'in_review', 'failed_check'].includes(draft.status)) fail(`A draft that is ${draft.status} cannot be rejected.`, 409)
  const { error } = await db.from('publish_drafts').update({
    status: 'rejected', reviewer_note: trimmed.slice(0, 2000), reviewed_by: actor.userId, reviewed_at: deps.now().toISOString(),
  }).eq('id', draftId).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not reject the draft: ${error.message}`, 500)
  return { status: 'rejected' }
}

// ---------- publishing a language version ----------

export async function setPublished(db: Db, actor: Actor, localeId: string, published: boolean, deps: AdminDeps = defaultDeps) {
  const { data: locale, error } = await db.from('publish_page_locales').select('id, page_id, language, is_published')
    .eq('id', localeId).eq('tenant_id', actor.tenantId).maybeSingle()
  check('the page language', error)
  if (!locale) fail('No such page in this company.', 404)
  if (published) {
    const site = (await siteOf(db, actor.tenantId))!
    const page = await pageOf(db, actor.tenantId, locale.page_id)
    const facts = await factsFor(db, deps, actor.tenantId, page, locale.language, site.settings)
    // D7, the thin-page rule: a tour page needs days, inclusions and a complete price.
    if (facts && !facts.publishable.ok) fail(`This tour cannot be published yet: ${facts.publishable.reasons.join(' ')}`, 409)
  }
  const { error: uErr } = await db.from('publish_page_locales')
    .update({ is_published: published, published_at: published ? deps.now().toISOString() : null })
    .eq('id', localeId).eq('tenant_id', actor.tenantId)
  if (uErr) fail(`Could not change it: ${uErr.message}`, 500)
  return { published, warning: await refresh(deps, actor.tenantId) }
}

// ---------- the footer's legal details (operator brief 2026-10-28) ----------

/** What a website's footer must state before the site may go public. */
export const FOOTER_REQUIRED = [
  ['legalEntity', 'the registered company name (Look and feel → Footer)'],
  ['licenseNumber', 'the ETAA licence number (Settings → Company)'],
  ['address', 'the company address (Settings → Company)'],
  ['whatsapp', 'the company WhatsApp number (Settings → Company)'],
  ['termsUrl', 'a link to your booking terms (Look and feel → Footer)'],
  ['privacyUrl', 'a link to your privacy notice (Look and feel → Footer)'],
] as const

export type FooterDetails = Record<typeof FOOTER_REQUIRED[number][0], string | null>

/** The footer's details as the website would show them. */
export async function footerOf(db: Db, tenantId: string, settings: unknown): Promise<FooterDetails> {
  const { data, error } = await db.from('tenants').select('license_number, company_address, whatsapp_number').eq('id', tenantId).maybeSingle()
  check('the company', error)
  const blank = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return { ...legalOf(settings), licenseNumber: blank(data?.license_number), address: blank(data?.company_address), whatsapp: blank(data?.whatsapp_number) }
}

/** What is still missing from the footer, in words a manager can act on. */
export function footerMissing(f: FooterDetails): string[] {
  return FOOTER_REQUIRED.filter(([k]) => !f[k]).map(([, words]) => words)
}

// ---------- the look: theme, palette, fonts (brand studio) ----------

/** The site's look as stored, as it resolves (what the website shows), and
 *  the choices a manager can make. */
export async function lookOf(db: Db, actor: Actor) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const stored = (site!.brand ?? {}) as Record<string, unknown>
  const resolved = resolveBrand(site!.archetype, stored)
  return {
    archetype: site!.archetype,
    stored: { palette: stored.palette ?? null, fontPair: stored.fontPair ?? null, website: typeof stored.website === 'string' ? stored.website : null },
    resolved: { palette: resolved.palette, fontPair: resolved.fontPair, onPrimary: resolved.onPrimary, onAccent: resolved.onAccent },
    problems: resolved.problems,
    footer: await footerOf(db, actor.tenantId, site!.settings),
    languages: site!.languages,
    about: Object.fromEntries(site!.languages.map(l => [l, aboutOf(site!.settings, l) ?? ''])),
    headline: Object.fromEntries(site!.languages.map(l => [l, homeOf(site!.settings, l).headline ?? ''])),
    foundedYear: homeOf(site!.settings, site!.languages[0] ?? 'en').foundedYear,
    choices: {
      archetypes: ARCHETYPES.map(a => ({ key: a, defaults: ARCHETYPE_DEFAULTS[a] })),
      palettes: PALETTE_PRESETS,
      fontPairs: Object.entries(FONT_PAIRS).map(([key, f]) => ({ key, label: f.label, display: f.display, text: f.text })),
    },
  }
}

/** Save the theme, palette and fonts. Colours that would be hard to read
 *  are refused with the reason — the website never gets them. The rest of
 *  the stored brand (tone, claims, words to avoid) is kept. */
export async function saveLook(db: Db, actor: Actor, input: { archetype: unknown; palette: unknown; fontPair: unknown; website?: unknown; legal?: unknown; about?: unknown; headline?: unknown; foundedYear?: unknown }, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  if (typeof input.archetype !== 'string' || !(ARCHETYPES as readonly string[]).includes(input.archetype)) fail(`Choose a theme: one of ${ARCHETYPES.join(', ')}.`)
  const archetype = input.archetype as Archetype
  // The agency's main website, for the header's link back (empty = none).
  let website: string | undefined
  if (typeof input.website === 'string' && input.website.trim()) {
    const origin = normalizeOrigin(input.website)
    if (!origin || origin.startsWith('http:')) fail('Your main website must be an https:// address.')
    website = origin!
  }
  const { website: _old, ...rest } = (site!.brand ?? {}) as Record<string, unknown>
  void _old
  const next = { ...rest, palette: input.palette, fontPair: input.fontPair, ...(website ? { website } : {}) }
  const problems = resolveBrand(archetype, next).problems
  if (problems.length) fail(problems.join(' '))
  // The footer's legal details, kept in the site's settings beside the rest.
  let settings: Record<string, unknown> | undefined
  if (input.legal !== undefined) {
    const raw = (input.legal ?? {}) as Record<string, unknown>
    const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
    const link = (v: unknown, what: string) => {
      const t = text(v, 500)
      if (!t) return null
      try { if (new URL(t).protocol === 'https:') return t } catch { /* refused below */ }
      return fail(`${what} must be an https:// address.`) as never
    }
    const legal = { entity: text(raw.entity, 200), termsUrl: link(raw.termsUrl, 'The booking terms link'), privacyUrl: link(raw.privacyUrl, 'The privacy notice link') }
    settings = { ...((site!.settings ?? {}) as Record<string, unknown>), legal }
  }
  // The About page's text, per language of the site, as the manager wrote it.
  if (input.about !== undefined) {
    const raw = (input.about ?? {}) as Record<string, unknown>
    const about: Record<string, string> = {}
    for (const lang of site!.languages) {
      const v = raw[lang]
      if (typeof v === 'string' && v.trim()) {
        if (v.length > 6000) fail('Keep the About text under 6,000 characters.')
        about[lang] = v.trim()
      }
    }
    settings = { ...(settings ?? (site!.settings ?? {}) as Record<string, unknown>), about }
  }
  // The home page's headline, per language (empty = the theme's own).
  if (input.headline !== undefined) {
    const raw = (input.headline ?? {}) as Record<string, unknown>
    const headline: Record<string, string> = {}
    for (const lang of site!.languages) {
      const v = raw[lang]
      if (typeof v === 'string' && v.trim()) {
        if (v.trim().length > 120) fail('Keep the headline under 120 characters.')
        headline[lang] = v.trim()
      }
    }
    settings = { ...(settings ?? (site!.settings ?? {}) as Record<string, unknown>), headline }
  }
  // The year the company started operating, for "Operating since" (empty = not shown).
  if (input.foundedYear !== undefined) {
    const y = input.foundedYear === null || input.foundedYear === '' ? null : Number(input.foundedYear)
    if (y !== null && (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear())) fail(`The year you started must be between 1900 and ${new Date().getFullYear()}.`)
    settings = { ...(settings ?? (site!.settings ?? {}) as Record<string, unknown>), foundedYear: y }
  }
  const { error } = await db.from('publish_sites').update({ archetype, brand: next, ...(settings ? { settings } : {}) }).eq('id', site!.id).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not save the look: ${error.message}`, 500)
  return { saved: true, warning: await refresh(deps, actor.tenantId) }
}

// ---------- tours on the agency's own website (lib/publish/embed.ts) ----------

/** The site's embed key and the websites its blocks may appear on. */
export async function embedSettingsOf(db: Db, actor: Actor) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  // Where the loader is served from: the renderer (publish-sites).
  return { ...embedOf(site!.settings), languages: site!.languages, rendererUrl: process.env.PUBLISH_RENDERER_URL ?? null }
}

/** Save the websites; make a key on first use (or a new one on request —
 *  the old one stops working at once). Managers. */
export async function saveEmbedSettings(db: Db, actor: Actor, input: { origins: unknown; newKey?: unknown }, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  if (!Array.isArray(input.origins)) fail('List the websites your tours may appear on.')
  const bad = (input.origins as unknown[]).filter(o => normalizeOrigin(o) === null)
  if (bad.length) fail(`Not a website address (https:// only): ${bad.map(String).join(', ')}`)
  const origins = [...new Set((input.origins as unknown[]).map(o => normalizeOrigin(o)!))]
  if (origins.length > MAX_ORIGINS) fail(`At most ${MAX_ORIGINS} websites.`)
  const current = embedOf(site!.settings)
  const key = input.newKey === true || !current.key ? newEmbedKey() : current.key
  const settings = { ...((site!.settings ?? {}) as Record<string, unknown>), embed: { key, origins } }
  const { error } = await db.from('publish_sites').update({ settings }).eq('id', site!.id).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not save: ${error.message}`, 500)
  return { key, origins, warning: await refresh(deps, actor.tenantId) }
}

// ---------- the website's addresses (step 11, lib/publish/domains) ----------

/** Railway's limit on custom domains per service (Pro plan). */
export const PROVIDER_DOMAIN_LIMIT = 20

/** The domain we own whose subdomains agencies may claim for free
 *  (sunrise.<base>), served by one wildcard domain on the renderer. */
export function freeBaseDomain(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.PUBLISH_SITES_BASE_DOMAIN ?? '').trim().toLowerCase()
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(raw) ? raw : null
}

/** Hostnames no agency may connect: our own, and the hosting's. */
function reservedHost(host: string, base: string | null): boolean {
  return /(^|\.)(getautoura\.net|railway\.app|up\.railway\.app)$/.test(host) || (base !== null && (host === base || host.endsWith(`.${base}`)))
}

type DomainRow = { id: string; hostname: string; kind: string; status: string; provider_ref: string | null; last_error: string | null; last_checked_at: string | null; verified_at: string | null }

async function domainRows(db: Db, siteId: string): Promise<DomainRow[]> {
  const { data, error } = await db.from('publish_domains')
    .select('id, hostname, kind, status, provider_ref, last_error, last_checked_at, verified_at').eq('site_id', siteId).order('created_at')
  check('the domains', error)
  return (data ?? []) as DomainRow[]
}

export async function domainsOf(db: Db, actor: Actor, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const rows = await domainRows(db, site!.id)
  return {
    site: { status: site!.status },
    domains: rows.map(r => ({ id: r.id, hostname: r.hostname, kind: r.kind, status: r.status, lastError: r.last_error, lastCheckedAt: r.last_checked_at, connected: !!r.provider_ref })),
    freeBase: freeBaseDomain(),
    providerReady: !!deps.domains,
  }
}

const kindForNew = (rows: DomainRow[]) => rows.some(r => r.kind === 'primary') ? 'alias_redirect' : 'primary'

/** Connect the agency's own domain: register it with the provider, keep the
 *  row, and answer with the DNS records the agency adds. Managers. */
export async function addDomain(db: Db, actor: Actor, rawHost: unknown, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const host = normalizeHost(typeof rawHost === 'string' ? rawHost.replace(/^https?:\/\//, '').split('/')[0] : '')
  if (!host) fail('Enter a domain such as tours.youragency.com.')
  if (reservedHost(host!, freeBaseDomain())) fail('That address belongs to Autoura — choose your own domain, or claim a free address below.')
  if (!deps.domains) fail('Connecting your own domain is not switched on yet — contact Autoura.', 503)
  const { data: taken, error: tErr } = await db.from('publish_domains').select('id').eq('hostname', host).maybeSingle()
  check('the domain', tErr)
  if (taken) fail('That domain is already connected to a website.', 409)
  const rows = await domainRows(db, site!.id)
  const connected = rows.filter(r => !!r.provider_ref).length
  if (connected >= PROVIDER_DOMAIN_LIMIT) fail('The domain limit on our hosting is reached — contact Autoura to connect more domains.', 409)

  let state: DomainState
  try {
    state = await deps.domains!.add(host!)
  } catch (e) {
    fail(e instanceof Error ? e.message : 'The domain could not be connected.', 502)
  }
  const { data: row, error } = await db.from('publish_domains').insert({
    tenant_id: actor.tenantId, site_id: site!.id, hostname: host, kind: kindForNew(rows),
    status: state!.status, provider_ref: state!.ref, last_error: state!.error, last_checked_at: deps.now().toISOString(),
  }).select('id').single()
  if (error) {
    await deps.domains!.remove(state!.ref).catch(() => {})
    fail(`Could not save the domain: ${error.message}`, 500)
  }
  return { id: row.id as string, hostname: host, status: state!.status, records: state!.records }
}

/** Ask the provider how far a domain has got; when it is ready, the website
 *  starts answering on it. Anyone may ask; the answer updates the row. */
export async function checkDomain(db: Db, actor: Actor, id: string, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const row = (await domainRows(db, site!.id)).find(r => r.id === id) ?? fail('No such domain on your website.', 404)
  if (!row!.provider_ref) return { id, hostname: row!.hostname, status: row!.status, records: [] as DnsRecord[] }
  if (!deps.domains) fail('Connecting your own domain is not switched on yet — contact Autoura.', 503)
  let state: DomainState
  try {
    state = await deps.domains!.check(row!.provider_ref!, row!.hostname)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The domain could not be checked.'
    await db.from('publish_domains').update({ last_error: message, last_checked_at: deps.now().toISOString() }).eq('id', id).eq('tenant_id', actor.tenantId)
    fail(message, 502)
  }
  const became = state!.status === 'active' && row!.status !== 'active'
  const { error } = await db.from('publish_domains').update({
    status: state!.status, last_error: state!.error, last_checked_at: deps.now().toISOString(),
    ...(became ? { verified_at: deps.now().toISOString() } : {}),
  }).eq('id', id).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not save the domain's status: ${error.message}`, 500)
  return { id, hostname: row!.hostname, status: state!.status, records: state!.records, error: state!.error, warning: became ? await refresh(deps, actor.tenantId) : null }
}

/** A free address on our domain (sunrise.<base>) — ready at once, no DNS. Managers. */
export async function claimFreeAddress(db: Db, actor: Actor, rawLabel: unknown, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const base = freeBaseDomain() ?? fail('Free addresses are not switched on yet — contact Autoura.', 503)
  const label = typeof rawLabel === 'string' ? rawLabel.trim().toLowerCase() : ''
  if (!/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/.test(label)) fail('Use 3 to 40 letters, numbers or dashes, for example sunrise-travel.')
  if (['www', 'api', 'app', 'admin', 'mail', 'tours', 'autoura', 'support', 'help'].includes(label)) fail('That name is reserved — choose another.')
  const host = `${label}.${base}`
  const { data: taken, error: tErr } = await db.from('publish_domains').select('id').eq('hostname', host).maybeSingle()
  check('the address', tErr)
  if (taken) fail('That address is taken — choose another.', 409)
  const rows = await domainRows(db, site!.id)
  const { data: row, error } = await db.from('publish_domains').insert({
    tenant_id: actor.tenantId, site_id: site!.id, hostname: host, kind: kindForNew(rows),
    status: 'active', verified_at: deps.now().toISOString(), last_checked_at: deps.now().toISOString(),
  }).select('id').single()
  if (error) fail(`Could not save the address: ${error.message}`, 500)
  return { id: row.id as string, hostname: host, warning: await refresh(deps, actor.tenantId) }
}

/** Make a ready address the website's main one; the others then redirect to it. Managers. */
export async function setMainDomain(db: Db, actor: Actor, id: string, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const rows = await domainRows(db, site!.id)
  const row = rows.find(r => r.id === id) ?? fail('No such domain on your website.', 404)
  if (row!.kind === 'test') fail('A test address cannot be the main one.')
  if (row!.status !== 'active') fail('Only a ready domain can be the main one — finish its DNS first.', 409)
  // One main address per site (unique index): demote first, then promote.
  for (const r of rows.filter(r => r.kind === 'primary' && r.id !== id)) {
    const { error } = await db.from('publish_domains').update({ kind: 'alias_redirect' }).eq('id', r.id).eq('tenant_id', actor.tenantId)
    if (error) fail(`Could not change the main address: ${error.message}`, 500)
  }
  const { error } = await db.from('publish_domains').update({ kind: 'primary' }).eq('id', id).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not change the main address: ${error.message}`, 500)
  return { id, warning: await refresh(deps, actor.tenantId) }
}

/** Disconnect a domain. Managers. */
export async function removeDomain(db: Db, actor: Actor, id: string, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const row = (await domainRows(db, site!.id)).find(r => r.id === id) ?? fail('No such domain on your website.', 404)
  if (row!.kind === 'test') fail('Test addresses are managed by Autoura.')
  if (row!.provider_ref) {
    if (!deps.domains) fail('Connecting your own domain is not switched on yet — contact Autoura.', 503)
    try { await deps.domains!.remove(row!.provider_ref!) } catch (e) { fail(e instanceof Error ? e.message : 'The hosting provider refused.', 502) }
  }
  const { error } = await db.from('publish_domains').delete().eq('id', id).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not remove the domain: ${error.message}`, 500)
  return { removed: true, warning: await refresh(deps, actor.tenantId) }
}

/** Make the website public (search engines may index its main address) or
 *  take it back to draft. Public needs a ready main address. Managers. */
export async function setSiteLive(db: Db, actor: Actor, live: boolean, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  if (site!.status === 'suspended') fail('This website is suspended — contact Autoura.', 409)
  if (live) {
    const rows = await domainRows(db, site!.id)
    if (!rows.some(r => r.kind === 'primary' && r.status === 'active')) fail('Connect a domain (or claim a free address) and let it finish first — the website needs a ready main address to go public.', 409)
    // The footer must say who the visitor is dealing with before anyone sees it.
    const missing = footerMissing(await footerOf(db, actor.tenantId, site!.settings))
    if (missing.length) fail(`Before the website goes public, its footer needs ${missing.join('; ')}.`, 409)
  }
  const { error } = await db.from('publish_sites').update({ status: live ? 'live' : 'draft' }).eq('id', site!.id).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not change it: ${error.message}`, 500)
  return { status: live ? 'live' : 'draft', warning: await refresh(deps, actor.tenantId) }
}

/** The sync job's pass over domains still waiting on DNS or a certificate. */
export async function checkPendingDomains(db: Db, deps: AdminDeps = defaultDeps, limit = 20): Promise<{ checked: number; ready: number }> {
  if (!deps.domains) return { checked: 0, ready: 0 }
  const { data, error } = await db.from('publish_domains').select('id, tenant_id, hostname, status, provider_ref')
    .in('status', ['pending_dns', 'verifying']).not('provider_ref', 'is', null).order('last_checked_at', { ascending: true, nullsFirst: true }).limit(limit)
  check('domains waiting', error)
  let ready = 0
  for (const r of (data ?? []) as Array<{ id: string; tenant_id: string; hostname: string; status: string; provider_ref: string }>) {
    try {
      const state = await deps.domains.check(r.provider_ref, r.hostname)
      const became = state.status === 'active'
      await db.from('publish_domains').update({
        status: state.status, last_error: state.error, last_checked_at: deps.now().toISOString(),
        ...(became ? { verified_at: deps.now().toISOString() } : {}),
      }).eq('id', r.id)
      if (became) { ready++; await refresh(deps, r.tenant_id) }
    } catch (e) {
      await db.from('publish_domains').update({ last_error: e instanceof Error ? e.message : String(e), last_checked_at: deps.now().toISOString() }).eq('id', r.id)
    }
  }
  return { checked: (data ?? []).length, ready }
}

// ---------- the agency's Google reviews (lib/publish/reviews.ts) ----------

/** Which business the reviews come from, whether they show, and a preview. */
export async function reviewsOf(db: Db, actor: Actor) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const r = reviewsSettingsOf(site!.settings)
  const ready = !!process.env.GOOGLE_MAPS_API_KEY
  const preview = ready && r.placeId ? await placeReviews(r.placeId, site!.languages[0] ?? 'en') : null
  return { placeId: r.placeId, show: r.show, ready, preview }
}

export async function findReviewPlaces(db: Db, actor: Actor, query: unknown) {
  if (!(await siteOf(db, actor.tenantId))) fail('This company has no website yet.', 404)
  const q = typeof query === 'string' ? query.trim() : ''
  if (q.length < 3) fail('Type your business name as it appears on Google Maps.')
  try {
    return { places: await searchPlaces(q.slice(0, 200)) }
  } catch (e) {
    fail(e instanceof Error ? e.message : 'Google could not search just now.', 502)
  }
}

/** Pick the business (Google's place ID — the one thing we may keep) and
 *  whether its reviews show. Managers. */
export async function saveReviews(db: Db, actor: Actor, input: { placeId: unknown; show: unknown }, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const placeId = input.placeId === null ? null : typeof input.placeId === 'string' && /^[A-Za-z0-9_-]{10,300}$/.test(input.placeId) ? input.placeId : fail('Pick your business from the search.')
  const settings = { ...((site!.settings ?? {}) as Record<string, unknown>), reviews: placeId ? { placeId, show: input.show !== false } : null }
  const { error } = await db.from('publish_sites').update({ settings }).eq('id', site!.id).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not save: ${error.message}`, 500)
  return { placeId, show: placeId ? input.show !== false : false, warning: await refresh(deps, actor.tenantId) }
}

// ---------- the data feed's key (lib/publish/feed.ts) ----------

export async function feedKeyOf(db: Db, actor: Actor) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const f = feedOf(site!.settings)
  return { exists: f !== null, prefix: f?.prefix ?? null, createdAt: f?.created_at ?? null }
}

/** Make a new key: returned ONCE, stored only as its hash; the old one stops. */
export async function newFeedKeyFor(db: Db, actor: Actor, deps: AdminDeps = defaultDeps) {
  const site = await siteOf(db, actor.tenantId) ?? fail('This company has no website yet.', 404)
  const key = newFeedKey()
  const settings = { ...((site!.settings ?? {}) as Record<string, unknown>), feed: { hash: hashFeedKey(key), prefix: key.slice(0, 10), created_at: deps.now().toISOString() } }
  const { error } = await db.from('publish_sites').update({ settings }).eq('id', site!.id).eq('tenant_id', actor.tenantId)
  if (error) fail(`Could not make the key: ${error.message}`, 500)
  return { key, prefix: key.slice(0, 10) }
}
