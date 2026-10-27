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
//   · a tour page publishes only if the thin-page rule allows it (D7).

import type { TourFacts } from './contract'
import { checkSegments, type CheckResult, type Segment } from './engine/fact-check'
import { namesFromFacts } from './engine/slots'
import type { EngineContent, DraftResult, PartKind } from './engine/engine'
import { checkTranslation } from './engine/translate'
import { loadTourFacts } from './tour-facts'
import { indicativeCurrenciesOf } from './site-data'
import { engineBrand, generateTourDraft, generateTourTranslation } from './engine/generate'
import { factsHash, partSegments, renderableNarrative, toStoredPart, tourFingerprint, withPart, type NarrativeBundle, type RenderableNarrative } from './narrative'
import { publishTags } from './sync/events'
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
  generate: typeof generateTourDraft
  /** The tour's wording in the page language; defaults to the engine's. */
  translate?: typeof generateTourTranslation
  revalidate: (tenantId: string, tags: string[]) => Promise<void>
  now: () => Date
}

export const defaultDeps: AdminDeps = {
  facts: loadTourFacts,
  generate: generateTourDraft,
  translate: generateTourTranslation,
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
    id: string; tenant_id: string; archetype: 'private_journeys' | 'transparent_value'; status: string
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
    .select('id, site_id, kind, tour_template_id, tour_templates(template_name), publish_page_locales(id, language, slug, is_published, current_version_id, published_at)')
    .eq('id', pageId).eq('tenant_id', tenantId).maybeSingle()
  check('the page', error)
  if (!data) fail('No such page in this company.', 404)
  return data as {
    id: string; site_id: string; kind: string; tour_template_id: string | null; tour_templates: { template_name: string } | null
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
  const [facts, drafts, versions] = await Promise.all([
    factsFor(db, deps, actor.tenantId, page, language, site!.settings),
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
    narrative,
    drafts: drafts.data ?? [],
    versions: versions.data ?? [],
  }
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
