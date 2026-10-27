// ============================================
// Publish — drafting a tour page's narrative from what Autoura knows
// ============================================
// Gathers the engine's inputs for one tour page (its facts, the company's
// brand and glossary) and calls the content engine. Reads only: storing the
// result as a draft, and approving it, is the approval workflow (step 7).

import type { TourFacts } from '../contract'
import { createMessageWithRetry, replyText } from '@/lib/ai/anthropic-client'
import { CLAUDE_MODEL } from '@/lib/ai/models'
import { resolveBrand } from '../brand'
import { loadTourFacts } from '../tour-facts'
import { indicativeCurrenciesOf } from '../site-data'
import { draftNarrative, type DraftKind, type DraftResult, type EngineBrand, type ModelCall, type SourceNote } from './engine'
import { draftTranslation, labelSources } from './translate'

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** The engine's model: the product's one Claude model (lib/ai/models.ts),
 *  structured output, medium effort — writing from given facts needs care,
 *  not deep reasoning (the same setting as the pricing grid's day writer).
 *  The system prompt is identical on every call, so it is cached. */
export const claudeModelCall: ModelCall = async ({ system, messages, schema }) => {
  const response = await createMessageWithRetry({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
  })
  return {
    text: response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens' ? null : replyText(response),
    stopReason: response.stop_reason ?? null,
    model: response.model,
  }
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()).slice(0, 30) : []

/** The brand as the engine reads it: tone (resolved), plus the claims the
 *  agency may make and the words it avoids (publish_sites.brand). */
export function engineBrand(archetype: 'private_journeys' | 'transparent_value', stored: unknown): EngineBrand {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  return { tone: resolveBrand(archetype, stored).tone, claims: strings(raw.claims), avoid: strings(raw.avoid) }
}

export async function generateTourDraft(db: Db, input: {
  siteId: string
  pageId: string
  language: string
  kind: DraftKind
  instruction?: string | null
  sources?: SourceNote[]
}, callModel: ModelCall = claudeModelCall, deps: { tourFacts?: typeof loadTourFacts } = {}): Promise<DraftResult & { facts: TourFacts }> {
  const check = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`reading ${what}: ${error.message}`)
  }
  const { data: site, error: sErr } = await db.from('publish_sites')
    .select('id, tenant_id, archetype, languages, brand, settings, tenants(company_name)').eq('id', input.siteId).maybeSingle()
  check('the site', sErr)
  if (!site) throw new Error('no such site')
  if (!site.languages.includes(input.language)) throw new Error(`the site does not publish in "${input.language}"`)

  const { data: page, error: pErr } = await db.from('publish_pages')
    .select('id, kind, tour_template_id, tour_templates(template_name)')
    .eq('id', input.pageId).eq('site_id', input.siteId).eq('tenant_id', site.tenant_id).maybeSingle()
  check('the page', pErr)
  if (!page || page.kind !== 'tour' || !page.tour_template_id) throw new Error('the page is not a tour page of this site')

  const [facts, glossary] = await Promise.all([
    (deps.tourFacts ?? loadTourFacts)(db, {
      tenantId: site.tenant_id, templateId: page.tour_template_id, language: input.language,
      indicativeCurrencies: indicativeCurrenciesOf(site.settings),
    }),
    db.from('publish_glossary').select('term_key, spelling').eq('tenant_id', site.tenant_id).eq('language', input.language),
  ])
  check('the glossary', glossary.error)

  const result = await draftNarrative({
    kind: input.kind,
    language: input.language,
    tourName: page.tour_templates?.template_name ?? '',
    companyName: site.tenants?.company_name ?? '',
    facts,
    brand: engineBrand(site.archetype, site.brand),
    sources: input.sources ?? [],
    glossary: ((glossary.data ?? []) as Array<{ term_key: string; spelling: string }>).map(g => ({ term: g.term_key, spelling: g.spelling })),
    instruction: input.instruction ?? null,
  }, callModel)
  return { ...result, facts }
}

/** The tour's own wording in the page's language, for review (the 'labels'
 *  part). Reads only, like generateTourDraft. */
export async function generateTourTranslation(db: Db, input: {
  siteId: string
  pageId: string
  language: string
  instruction?: string | null
}, callModel: ModelCall = claudeModelCall, deps: { tourFacts?: typeof loadTourFacts } = {}): Promise<DraftResult & { facts: TourFacts }> {
  const check = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`reading ${what}: ${error.message}`)
  }
  const { data: site, error: sErr } = await db.from('publish_sites')
    .select('id, tenant_id, archetype, languages, brand, settings').eq('id', input.siteId).maybeSingle()
  check('the site', sErr)
  if (!site) throw new Error('no such site')
  if (!site.languages.includes(input.language)) throw new Error(`the site does not publish in "${input.language}"`)

  const { data: page, error: pErr } = await db.from('publish_pages')
    .select('id, kind, tour_template_id, tour_templates(template_name)')
    .eq('id', input.pageId).eq('site_id', input.siteId).eq('tenant_id', site.tenant_id).maybeSingle()
  check('the page', pErr)
  if (!page || page.kind !== 'tour' || !page.tour_template_id) throw new Error('the page is not a tour page of this site')

  const [facts, glossary] = await Promise.all([
    (deps.tourFacts ?? loadTourFacts)(db, {
      tenantId: site.tenant_id, templateId: page.tour_template_id, language: input.language,
      indicativeCurrencies: indicativeCurrenciesOf(site.settings),
    }),
    db.from('publish_glossary').select('term_key, spelling').eq('tenant_id', site.tenant_id).eq('language', input.language),
  ])
  check('the glossary', glossary.error)

  const result = await draftTranslation({
    language: input.language,
    sources: labelSources(facts, page.tour_templates?.template_name ?? ''),
    glossary: ((glossary.data ?? []) as Array<{ term_key: string; spelling: string }>).map(g => ({ term: g.term_key, spelling: g.spelling })),
    avoid: engineBrand(site.archetype, site.brand).avoid,
    instruction: input.instruction ?? null,
  }, callModel)
  return { ...result, facts }
}
