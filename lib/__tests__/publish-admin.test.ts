import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTourPage, draftWithEngine, editDraft, approveDraft, rejectDraft, setPublished, pageDetail, slugify, validEditedContent, lookOf, saveLook, embedSettingsOf, saveEmbedSettings, uploadPublishMedia, isOwnMedia,
  approvePublicRate, saveTourDetails, savePageFaq, PublishError, type AdminDeps, type Actor,
} from '@/lib/publish/admin'
import type { TourFacts } from '@/lib/publish/contract'
import type { RateProposal } from '@/lib/publish/public-rate'

// ============================================================================
// The approval workflow (docs/publish/PLAN.md §10, step 7), against an
// in-memory database shaped like Supabase's answers. What it proves:
//   · AI text reaches the page only through a person's approval, and the
//     approval re-checks the text as it stands;
//   · text written about facts that have since changed cannot be approved;
//   · every approval is a new version (history kept, part by part);
//   · a tour publishes only past the thin-page rule (D7);
//   · writers draft and edit, managers approve and publish (route tests).
// ============================================================================

const T = 'tenant-a', OTHER = 'tenant-b', SITE = 'site-a', TOUR = 'tour-a', PAGE = 'page-a'
const actor: Actor = { tenantId: T, userId: 'user-1', name: 'Mona Manager' }

type Row = Record<string, unknown>
let db: ReturnType<typeof makeDb>
let seq = 0

/** A small PostgREST stand-in: eq/in/order/limit, insert/update, and the embeds these functions read. */
function makeDb(tables: Record<string, Row[]>) {
  const embed = (table: string, row: Row): Row => {
    if (table === 'publish_sites') return { ...row, tenants: tables.tenants.find(t => t.id === row.tenant_id) ?? null }
    if (table === 'publish_pages') return {
      ...row,
      tour_templates: tables.tour_templates.find(t => t.id === row.tour_template_id) ?? null,
      publish_page_locales: tables.publish_page_locales.filter(l => l.page_id === row.id),
    }
    return row
  }
  return {
    tables,
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let order: { col: string; asc: boolean } | null = null
      let limit = Infinity
      let op: { kind: 'select' } | { kind: 'insert'; rows: Row[] } | { kind: 'update'; patch: Row } = { kind: 'select' }
      const rows = () => {
        let r = (tables[table] ?? []).filter(x => filters.every(f => f(x)))
        if (order) r = [...r].sort((a, b) => (a[order!.col] as number) > (b[order!.col] as number) ? (order!.asc ? 1 : -1) : (order!.asc ? -1 : 1))
        return r.slice(0, limit).map(x => embed(table, x))
      }
      const exec = (): { data: unknown; error: { message: string } | null } => {
        if (op.kind === 'insert') {
          const inserted: Row[] = []
          for (const r of op.rows) {
            if (table === 'publish_pages' && tables.publish_pages.some(p => p.site_id === r.site_id && p.tour_template_id === r.tour_template_id)) {
              return { data: null, error: { message: 'duplicate key value violates unique constraint "publish_pages_one_per_tour"' } }
            }
            const row = { id: r.id ?? `${table}-${++seq}`, created_at: new Date(Date.UTC(2026, 9, 25, 0, 0, seq)).toISOString(), ...r }
            tables[table].push(row); inserted.push(row)
          }
          return { data: inserted, error: null }
        }
        if (op.kind === 'update') {
          const hit = (tables[table] ?? []).filter(x => filters.every(f => f(x)))
          for (const h of hit) Object.assign(h, op.patch)
          return { data: hit, error: null }
        }
        return { data: rows(), error: null }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
        order: (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return q },
        limit: (n: number) => { limit = n; return q },
        insert: (r: Row | Row[]) => { op = { kind: 'insert', rows: Array.isArray(r) ? r : [r] }; return q },
        update: (patch: Row) => { op = { kind: 'update', patch }; return q },
        maybeSingle: async () => { const r = exec(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error } },
        single: async () => { const r = exec(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error } },
        then: (res: (v: unknown) => unknown) => res(exec()),
      }
      return q
    },
  }
}

const FACTS: TourFacts = {
  durationDays: 1, durationNights: 0, images: [],
  days: [{ day: 1, title: 'Giza', city: 'Giza', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Great Pyramid'] }],
  mainAttractions: ['Great Pyramid'], highlights: [], inclusions: ['Guide'], exclusions: [], accommodation: [],
  groupSize: null, departureDays: [], departures: [], cancellation: null,
  price: { status: 'available', currency: 'EUR', tierLabel: 'Standard', fromPrice: 70, bands: [{ minPax: 2, maxPax: 6, perPerson: 70 }], indicative: [] },
  publishable: { ok: true, reasons: [] },
}

let facts: TourFacts
let proposal: RateProposal
let deps: AdminDeps
const PROPOSAL: RateProposal = {
  currency: 'EUR', tier: 'standard', tierLabel: 'Standard', range: { min: 2, max: 6 },
  bands: [{ minPax: 2, maxPax: 3, perPerson: 80 }, { minPax: 4, maxPax: 6, perPerson: 70 }], missing: [], reasons: [],
}
const revalidate = vi.fn(async () => {})

beforeEach(() => {
  seq = 0
  facts = FACTS
  proposal = PROPOSAL
  revalidate.mockReset()
  revalidate.mockImplementation(async () => {})
  db = makeDb({
    tenants: [{ id: T, company_name: 'Sillage' }, { id: OTHER, company_name: 'Rival' }],
    publish_sites: [{ id: SITE, tenant_id: T, archetype: 'private_journeys', status: 'draft', languages: ['en', 'fr'], brand: { claims: [] }, settings: {} }],
    tour_templates: [
      { id: TOUR, tenant_id: T, template_name: 'Giza & the Pyramids' },
      { id: 'tour-b', tenant_id: T, template_name: 'Giza & the Pyramids' },
      { id: 'tour-x', tenant_id: OTHER, template_name: 'Not ours' },
    ],
    publish_pages: [{ id: PAGE, tenant_id: T, site_id: SITE, kind: 'tour', tour_template_id: TOUR }],
    publish_page_locales: [
      { id: 'loc-en', tenant_id: T, site_id: SITE, page_id: PAGE, language: 'en', slug: 'giza-and-the-pyramids', is_published: false, current_version_id: null },
      { id: 'loc-fr', tenant_id: T, site_id: SITE, page_id: PAGE, language: 'fr', slug: 'giza-and-the-pyramids', is_published: false, current_version_id: null },
    ],
    publish_drafts: [], publish_versions: [], publish_glossary: [], publish_sync_health: [], publish_domains: [],
  })
  deps = {
    facts: async () => facts,
    proposal: async () => proposal,
    generate: vi.fn(async () => ({
      status: 'in_review' as const, content: { kind: 'overview' as const, segments: [{ type: 'text' as const, text: 'Stand before the Great Pyramid at first light.' }] },
      check: { ok: true, violations: [], flags: [] }, notes: [], sourcesUsed: [], attempts: 1, model: 'claude-test', promptVersion: 'publish-narrative-v1', facts,
    })),
    revalidate,
    now: () => new Date('2026-10-25T12:00:00Z'),
  }
})

const draft = async () => (await draftWithEngine(db as never, actor, PAGE, { language: 'en', kind: 'overview' }, deps)).draftId
const draftRow = (id: string) => db.tables.publish_drafts.find(d => d.id === id)!
const expectError = async (p: Promise<unknown>, status: number, message: RegExp) => {
  const e = await p.catch(x => x)
  expect(e).toBeInstanceOf(PublishError)
  expect((e as PublishError).status).toBe(status)
  expect((e as PublishError).message).toMatch(message)
}

describe('pages', () => {
  it('a tour\'s page gets one slug per language, unique within the site', async () => {
    const { pageId } = await createTourPage(db as never, actor, 'tour-b')
    const locales = db.tables.publish_page_locales.filter(l => l.page_id === pageId)
    expect(locales.map(l => [l.language, l.slug, l.is_published])).toEqual([['en', 'giza-and-the-pyramids-2', false], ['fr', 'giza-and-the-pyramids-2', false]])
  })
  it('another company\'s tour is not found; a tour already paged is refused', async () => {
    await expectError(createTourPage(db as never, actor, 'tour-x'), 404, /No such tour/)
    await expectError(createTourPage(db as never, actor, TOUR), 409, /already has a page/)
  })
  it('slugs', () => {
    expect(slugify('Giza & the Pyramids — Full Day!')).toBe('giza-and-the-pyramids-full-day')
    expect(slugify('Croisière à Assouan')).toBe('croisiere-a-assouan')
  })
})

describe('drafts', () => {
  it('an engine draft is saved for review with what it was written from; it replaces the older open draft of that part', async () => {
    const first = await draft()
    const second = await draft()
    expect(draftRow(second)).toMatchObject({ origin: 'engine', status: 'in_review', kind: 'narrative', language: 'en', model: 'claude-test', prompt_version: 'publish-narrative-v1' })
    expect(draftRow(second).fact_fingerprint).toEqual(expect.any(String))
    expect(draftRow(first).status).toBe('superseded')
  })
  it('a person\'s edit is held to the same rule: a number sends it to failed_check, a clean edit back to review', async () => {
    const id = await draft()
    const bad = await editDraft(db as never, actor, id, { kind: 'overview', segments: [{ type: 'text', text: 'Three pyramids before lunch.' }] }, deps)
    expect(bad.status).toBe('failed_check')
    expect(bad.check.violations.map(v => v.match)).toEqual(['Three'])
    const good = await editDraft(db as never, actor, id, { kind: 'overview', segments: [{ type: 'text', text: 'The pyramids before lunch.' }] }, deps)
    expect(good.status).toBe('in_review')
    expect(draftRow(id).origin).toBe('user')
  })
  it('an edit cannot change the part, and only an open draft can be edited', async () => {
    const id = await draft()
    await expectError(editDraft(db as never, actor, id, { kind: 'highlights', items: [[{ type: 'text', text: 'x' }]] }, deps), 400, /not a draft of this kind|cannot change/)
    draftRow(id).status = 'approved'
    await expectError(editDraft(db as never, actor, id, { kind: 'overview', segments: [{ type: 'text', text: 'x' }] }, deps), 409, /Only an open draft/)
  })
  it('edited content is shape-checked: no empty text, no smuggled fields', () => {
    expect(validEditedContent('narrative', { kind: 'overview', segments: [{ type: 'text', text: '  ' }] })).toBeNull()
    expect(validEditedContent('narrative', { kind: 'overview', segments: [{ type: 'text', text: 'ok', extra: 1 }] }))
      .toEqual({ kind: 'overview', segments: [{ type: 'text', text: 'ok' }] })
    expect(validEditedContent('seo', { kind: 'overview', segments: [] })).toBeNull()
  })
})

describe('approval', () => {
  it('makes version 1, points the page at it, keeps the facts as shown (D15) and who approved', async () => {
    const id = await draft()
    const r = await approveDraft(db as never, actor, id, deps)
    expect(r.versionNo).toBe(1)
    const v = db.tables.publish_versions[0]
    expect(v).toMatchObject({ reason: 'approved_draft', approver_name: 'Mona Manager', approved_by: 'user-1', draft_id: id, language: 'en' })
    expect((v.facts_snapshot as { price: unknown }).price).toEqual(FACTS.price)
    expect((v.content as Record<string, unknown>).overview).toMatchObject({ part: 'overview' })
    expect(db.tables.publish_page_locales.find(l => l.id === 'loc-en')!.current_version_id).toBe(v.id)
    expect(draftRow(id)).toMatchObject({ status: 'approved', reviewed_by: 'user-1' })
  })
  it('a second approval is a new version carrying the other parts over — nothing is overwritten', async () => {
    await approveDraft(db as never, actor, await draft(), deps)
    ;(deps.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'in_review', content: { kind: 'seo', title: 'Giza & the Pyramids', description: 'The plateau at dawn.' },
      check: { ok: true, violations: [], flags: [] }, notes: [], sourcesUsed: [], attempts: 1, model: 'claude-test', promptVersion: 'v', facts,
    })
    const seo = (await draftWithEngine(db as never, actor, PAGE, { language: 'en', kind: 'seo' }, deps)).draftId
    const r = await approveDraft(db as never, actor, seo, deps)
    expect(r.versionNo).toBe(2)
    expect(Object.keys(db.tables.publish_versions[1].content as object).sort()).toEqual(['overview', 'seo'])
    expect(db.tables.publish_versions).toHaveLength(2)
  })
  it('text that states a fact cannot be approved — re-checked at approval, whoever touched it last', async () => {
    const id = await draft()
    draftRow(id).content = { kind: 'overview', segments: [{ type: 'text', text: 'Only USD 70, lunch included.' }] } // slipped in behind the check
    await expectError(approveDraft(db as never, actor, id, deps), 409, /states a fact outside a slot/)
    expect(draftRow(id).status).toBe('failed_check')
    expect(db.tables.publish_versions).toHaveLength(0)
  })
  it('a draft written before the tour changed cannot be approved', async () => {
    const id = await draft()
    facts = { ...FACTS, days: [{ ...FACTS.days[0], sights: ['Sphinx'] }] }
    await expectError(approveDraft(db as never, actor, id, deps), 409, /tour has changed since this draft/)
  })
  it('a failed_check draft is refused with what to do', async () => {
    const id = await draft()
    draftRow(id).status = 'failed_check'
    await expectError(approveDraft(db as never, actor, id, deps), 409, /fix the words the check names/)
  })
  it('the website is refreshed only for a published page, and a refresh failure does not undo the approval', async () => {
    await approveDraft(db as never, actor, await draft(), deps)
    expect(revalidate).not.toHaveBeenCalled()
    db.tables.publish_page_locales.find(l => l.id === 'loc-en')!.is_published = true
    revalidate.mockRejectedValueOnce(new Error('renderer down'))
    const r = await approveDraft(db as never, actor, await draft(), deps)
    expect(r.versionNo).toBe(2)
    expect(r.warning).toMatch(/within the hour/)
  })
  it('another company\'s draft is not found', async () => {
    const id = await draft()
    await expectError(approveDraft(db as never, { ...actor, tenantId: OTHER }, id, deps), 404, /No such draft/)
  })
})

describe('rejection', () => {
  it('needs a note, which is kept for the next draft', async () => {
    const id = await draft()
    await expectError(rejectDraft(db as never, actor, id, ' ', deps), 400, /Say what should change/)
    await rejectDraft(db as never, actor, id, 'Mention the felucca.', deps)
    expect(draftRow(id)).toMatchObject({ status: 'rejected', reviewer_note: 'Mention the felucca.' })
  })
})

describe('publishing (D7)', () => {
  it('a tour that fails the thin-page rule cannot be published — the reasons are given', async () => {
    facts = { ...FACTS, publishable: { ok: false, reasons: ['No tier of the tour has a complete price — every rate it needs must be entered.'] } }
    await expectError(setPublished(db as never, actor, 'loc-en', true, deps), 409, /cannot be published yet: No tier/)
  })
  it('publishes without any approved text — the facts are the page — and refreshes the site', async () => {
    const r = await setPublished(db as never, actor, 'loc-en', true, deps)
    expect(r.published).toBe(true)
    expect(db.tables.publish_page_locales.find(l => l.id === 'loc-en')).toMatchObject({ is_published: true, published_at: '2026-10-25T12:00:00.000Z' })
    expect(revalidate).toHaveBeenCalledWith(T, [`publish:tenant:${T}`, `publish:tenant:${T}:tours`])
  })
  it('unpublishing is always allowed', async () => {
    facts = { ...FACTS, publishable: { ok: false, reasons: ['x'] } }
    db.tables.publish_page_locales.find(l => l.id === 'loc-en')!.is_published = true
    expect((await setPublished(db as never, actor, 'loc-en', false, deps)).published).toBe(false)
  })
})

describe('the review screen\'s data', () => {
  it('facts, the text that shows, drafts and versions for one language', async () => {
    await approveDraft(db as never, actor, await draft(), deps)
    const d = await pageDetail(db as never, actor, PAGE, 'en', deps)
    expect(d.page).toMatchObject({ tourName: 'Giza & the Pyramids', languages: ['en', 'fr'] })
    expect(d.narrative.overview).toEqual([{ type: 'text', text: 'Stand before the Great Pyramid at first light.' }])
    expect(d.versions).toHaveLength(1)
    await expectError(pageDetail(db as never, actor, PAGE, 'es', deps), 404, /no es version/)
  })
})

describe('the one public price', () => {
  const page = () => db.tables.publish_pages.find(p => p.id === PAGE)!
  it('a manager publishes the price they were shown — saved with who and when, and the website refreshed', async () => {
    const r = await approvePublicRate(db as never, actor, PAGE, PROPOSAL.bands, deps)
    expect(r.approved).toBe(true)
    expect(page()).toMatchObject({
      public_rate: { tier: 'standard', currency: 'EUR', bands: PROPOSAL.bands },
      public_rate_approved_at: '2026-10-25T12:00:00.000Z', public_rate_approved_by: 'user-1', public_rate_approver_name: 'Mona Manager',
    })
    expect(revalidate).toHaveBeenCalled()
  })
  it('a price that moved since the manager looked is refused — nothing is saved', async () => {
    await expectError(approvePublicRate(db as never, actor, PAGE, [{ minPax: 2, maxPax: 6, perPerson: 75 }], deps), 409, /changed since you opened/)
    expect(page().public_rate).toBeUndefined()
  })
  it('a proposal with uncovered group sizes cannot be published — the reasons are given', async () => {
    proposal = { ...PROPOSAL, bands: [], missing: [5, 6], reasons: ['No price for 5\u20136 travellers — enter the rates these group sizes need.'] }
    await expectError(approvePublicRate(db as never, actor, PAGE, PROPOSAL.bands, deps), 409, /cannot be published yet: No price for 5–6 travellers/)
  })
  it('the review screen shows the approved price and whether the rates still give it', async () => {
    expect((await pageDetail(db as never, actor, PAGE, 'en', deps)).rate).toMatchObject({ status: 'none', saved: null })
    await approvePublicRate(db as never, actor, PAGE, PROPOSAL.bands, deps)
    expect((await pageDetail(db as never, actor, PAGE, 'en', deps)).rate).toMatchObject({ status: 'in_step', saved: { approverName: 'Mona Manager' } })
    proposal = { ...PROPOSAL, bands: [{ minPax: 2, maxPax: 6, perPerson: 90 }] }
    expect((await pageDetail(db as never, actor, PAGE, 'en', deps)).rate).toMatchObject({ status: 'changed', saved: { bands: PROPOSAL.bands } })
  })
})

// ---------- who may do what, at the routes ----------

const auth = vi.hoisted(() => ({ role: 'member' as string }))
vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 'tenant-a', role: auth.role, user: { id: 'u', email: 'm@co.test', user_metadata: {} }, supabase: null }),
  createAdminClient: () => db,
}))
vi.mock('@/lib/publish/engine/generate', async (orig) => ({ ...(await orig<object>()), generateTourDraft: async () => { throw new Error('no engine in route tests') } }))

describe('roles at the routes', () => {
  it('a member drafts and edits but cannot approve, reject or publish', async () => {
    auth.role = 'member'
    const { POST: approve } = await import('@/app/api/publish/drafts/[id]/approve/route')
    const { POST: reject } = await import('@/app/api/publish/drafts/[id]/reject/route')
    const { POST: publish } = await import('@/app/api/publish/locales/[id]/publish/route')
    const { POST: addPage } = await import('@/app/api/publish/pages/route')
    const p = { params: Promise.resolve({ id: 'x' }) }
    for (const r of [await approve(new Request('http://x', { method: 'POST' }), p), await reject(new Request('http://x', { method: 'POST', body: '{}' }), p),
      await publish(new Request('http://x', { method: 'POST', body: '{}' }), p), await addPage(new Request('http://x', { method: 'POST', body: '{}' }))]) {
      expect(r.status).toBe(403)
    }
  })
  it('a viewer cannot draft or edit', async () => {
    auth.role = 'viewer'
    const { POST: draftRoute } = await import('@/app/api/publish/pages/[id]/drafts/route')
    const { PATCH: edit } = await import('@/app/api/publish/drafts/[id]/route')
    const p = { params: Promise.resolve({ id: 'x' }) }
    expect((await draftRoute(new Request('http://x', { method: 'POST', body: '{}' }), p)).status).toBe(403)
    expect((await edit(new Request('http://x', { method: 'PATCH', body: '{}' }), p)).status).toBe(403)
  })
  it('a manager reaches the rules, which answer in their own words', async () => {
    auth.role = 'manager'
    const { POST: approve } = await import('@/app/api/publish/drafts/[id]/approve/route')
    const r = await approve(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'missing' }) })
    expect(r.status).toBe(404)
    expect((await r.json()).error).toMatch(/No such draft/)
  })
})

describe('the tour\'s wording in the second language (translated, approved)', () => {
  const translated = (items: Array<[string, string]>) => vi.fn(async () => ({
    status: 'in_review' as const, content: { kind: 'labels' as const, items: items.map(([source, text]) => ({ source, text })) },
    check: { ok: true, violations: [], flags: [] }, notes: [], sourcesUsed: [], attempts: 1, model: 'claude-test', promptVersion: 'publish-labels-v1', facts,
  }))

  it('is not offered in English — the records are already English', async () => {
    await expectError(draftWithEngine(db as never, actor, PAGE, { language: 'en', kind: 'labels' }, deps), 400, /already in English/)
  })

  it('is drafted for review, approved into a version, and gives the unpublished page its address in that language', async () => {
    deps.translate = translated([['Giza & the Pyramids', 'Gizeh et les pyramides'], ['Guide', 'Guide']])
    const { draftId, status } = await draftWithEngine(db as never, actor, PAGE, { language: 'fr', kind: 'labels' }, deps)
    expect(status).toBe('in_review')
    expect(draftRow(draftId)).toMatchObject({ kind: 'narrative', language: 'fr', content: { kind: 'labels' } })

    await approveDraft(db as never, actor, draftId, deps)
    const version = db.tables.publish_versions[0]
    expect((version.content as { labels: { items: unknown[] } }).labels.items).toEqual([
      { source: 'Giza & the Pyramids', text: 'Gizeh et les pyramides' }, { source: 'Guide', text: 'Guide' },
    ])
    expect(db.tables.publish_page_locales.find(l => l.id === 'loc-fr')!.slug).toBe('gizeh-et-les-pyramides')
    expect(db.tables.publish_page_locales.find(l => l.id === 'loc-en')!.slug).toBe('giza-and-the-pyramids')

    const detail = await pageDetail(db as never, actor, PAGE, 'fr', deps)
    expect(detail.narrative.labels).toEqual({ 'Giza & the Pyramids': 'Gizeh et les pyramides', Guide: 'Guide' })
  })

  it('a published page keeps its address — no live link breaks', async () => {
    db.tables.publish_page_locales.find(l => l.id === 'loc-fr')!.is_published = true
    deps.translate = translated([['Giza & the Pyramids', 'Gizeh et les pyramides']])
    const { draftId } = await draftWithEngine(db as never, actor, PAGE, { language: 'fr', kind: 'labels' }, deps)
    await approveDraft(db as never, actor, draftId, deps)
    expect(db.tables.publish_page_locales.find(l => l.id === 'loc-fr')!.slug).toBe('giza-and-the-pyramids')
  })

  it('an edit that changes a number is sent to failed_check and cannot be approved', async () => {
    deps.translate = translated([['Guide', 'Guide']])
    const { draftId } = await draftWithEngine(db as never, actor, PAGE, { language: 'fr', kind: 'labels' }, deps)
    const r = await editDraft(db as never, actor, draftId, { kind: 'labels', items: [{ source: 'Guide', text: 'Guide (2 jours)' }] }, deps)
    expect(r.status).toBe('failed_check')
    await expectError(approveDraft(db as never, actor, draftId, deps), 409, /changes a number, price or date/)
  })
})

describe('the look (brand studio)', () => {
  it('saves the theme, colours and fonts, keeps the rest of the brand, and refreshes the website', async () => {
    db.tables.publish_sites[0].brand = { claims: ['Egyptologist guides'], tone: 'warm' }
    const palette = { primary: '#1e2a78', accent: '#ff6b5b', ink: '#111827', surface: '#ffffff' }
    await saveLook(db as never, actor, { archetype: 'modern', palette, fontPair: 'sleek' }, deps)
    expect(db.tables.publish_sites[0]).toMatchObject({ archetype: 'modern', brand: { claims: ['Egyptologist guides'], tone: 'warm', palette, fontPair: 'sleek' } })
    expect(revalidate).toHaveBeenCalled()
    const look = await lookOf(db as never, actor)
    expect(look).toMatchObject({ archetype: 'modern', resolved: { palette, fontPair: 'sleek' }, problems: [] })
    expect(look.choices.archetypes.map(a => a.key)).toContain('modern')
  })
  it('refuses colours that would be hard to read — the website never gets them', async () => {
    await expectError(saveLook(db as never, actor, { archetype: 'modern', palette: { primary: '#eeeeee', accent: '#ffffff', ink: '#dddddd', surface: '#ffffff' }, fontPair: 'sleek' }, deps), 400, /hard to read/)
    expect(db.tables.publish_sites[0].archetype).toBe('private_journeys')
  })
  it('refuses a theme or font that does not exist', async () => {
    await expectError(saveLook(db as never, actor, { archetype: 'gold_luxury', palette: undefined, fontPair: 'sleek' }, deps), 400, /Choose a theme/)
    await expectError(saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'comic-sans' }, deps), 400, /fontPair/)
  })
})

describe('tours on the agency\'s own website (embed settings)', () => {
  it('saving websites makes a key once, keeps it, and keeps the other settings', async () => {
    db.tables.publish_sites[0].settings = { indicativeCurrencies: ['USD'] }
    const first = await saveEmbedSettings(db as never, actor, { origins: ['www.agency.com', 'https://www.agency.com/tours'] }, deps)
    expect(first.origins).toEqual(['https://www.agency.com'])
    expect(first.key).toMatch(/^[A-Za-z0-9]{24}$/)
    const again = await saveEmbedSettings(db as never, actor, { origins: ['https://www.agency.com', 'https://agency.com'] }, deps)
    expect(again.key).toBe(first.key)
    expect(db.tables.publish_sites[0].settings).toEqual({ indicativeCurrencies: ['USD'], embed: { key: first.key, origins: ['https://www.agency.com', 'https://agency.com'] } })
    expect((await embedSettingsOf(db as never, actor)).key).toBe(first.key)
  })
  it('a new key on request; the old one stops at once', async () => {
    const { key } = await saveEmbedSettings(db as never, actor, { origins: ['https://www.agency.com'] }, deps)
    const fresh = await saveEmbedSettings(db as never, actor, { origins: ['https://www.agency.com'], newKey: true }, deps)
    expect(fresh.key).not.toBe(key)
  })
  it('refuses an address that is not an https website', async () => {
    await expectError(saveEmbedSettings(db as never, actor, { origins: ['http://www.agency.com'] }, deps), 400, /https/)
    await expectError(saveEmbedSettings(db as never, actor, { origins: 'https://www.agency.com' }, deps), 400, /List the websites/)
  })
})

describe('the agency\'s main website (header link back)', () => {
  const palette = { primary: '#1d6b64', accent: '#38d9a9', ink: '#0f1720', surface: '#ffffff' }
  it('is saved as an https origin, and cleared when left empty', async () => {
    await saveLook(db as never, actor, { archetype: 'modern', palette, fontPair: 'sleek', website: 'www.sunrise-travel.example/home' }, deps)
    expect((db.tables.publish_sites[0].brand as { website?: string }).website).toBe('https://www.sunrise-travel.example')
    await saveLook(db as never, actor, { archetype: 'modern', palette, fontPair: 'sleek', website: '' }, deps)
    expect(db.tables.publish_sites[0].brand).not.toHaveProperty('website')
  })
  it('refuses a plain http address', async () => {
    await expectError(saveLook(db as never, actor, { archetype: 'modern', palette, fontPair: 'sleek', website: 'http://www.sunrise-travel.example' }, deps), 400, /https/)
  })
})

// ============================================================================
// The template's details (migration 444): saved on the tour by a manager, the
// itinerary MERGED (a partial form must never rebuild a day — the day-editor
// lesson), and the page's FAQ per language.
// ============================================================================

describe('tour details and questions for the website', () => {
  const dayTour = () => {
    const t = db.tables.tour_templates.find(x => x.id === TOUR)!
    Object.assign(t, { duration_days: 1, itinerary: [{ day: 1, city: 'Giza', title: 'Giza', attractions: ['Giza Pyramids'], meals: { lunch: 'included' }, services: { guide_required: true } }] })
    return t
  }
  it('saves where it meets, the guides\' languages, hours and stops — keeping everything else the day said', async () => {
    const t = dayTour()
    await saveTourDetails(db as never, actor, PAGE, {
      meetingPoint: '  Hotel lobby  ', guideLanguages: ['en', 'fr', 'en'], durationHours: 6.7,
      stops: [{ time: '08:00', name: 'Pickup' }, { time: '', name: 'Giza Pyramids' }],
    }, deps)
    expect(t.meeting_point).toBe('Hotel lobby')
    expect(t.guide_languages).toEqual(['en', 'fr'])
    expect(t.duration_hours).toBe(7) // whole hours, as the tour sheet carries them
    expect(t.itinerary).toEqual([{ day: 1, city: 'Giza', title: 'Giza', attractions: ['Giza Pyramids'], meals: { lunch: 'included' }, services: { guide_required: true },
      stops: [{ time: '08:00', name: 'Pickup' }, { time: null, name: 'Giza Pyramids' }] }])
    expect(revalidate).toHaveBeenCalled()
  })
  it('a field not sent is left as it is; an empty meeting point clears it', async () => {
    const t = dayTour()
    Object.assign(t, { meeting_point: 'Gate 2', guide_languages: ['de'] })
    await saveTourDetails(db as never, actor, PAGE, { meetingPoint: '' }, deps)
    expect(t.meeting_point).toBeNull()
    expect(t.guide_languages).toEqual(['de'])
  })
  it('refuses what it cannot keep: stops on a longer tour, a time that is not one, an unknown language', async () => {
    const t = dayTour()
    await expectError(saveTourDetails(db as never, actor, PAGE, { stops: [{ time: '25:00', name: 'Late' }] }, deps), 400, /not a time/)
    await expectError(saveTourDetails(db as never, actor, PAGE, { stops: [{ time: '09:00', name: ' ' }] }, deps), 400, /needs a name/)
    await expectError(saveTourDetails(db as never, actor, PAGE, { guideLanguages: ['klingon'] }, deps), 400, /Guide languages/)
    await expectError(saveTourDetails(db as never, actor, PAGE, { durationHours: 30 }, deps), 400, /24 hours/)
    Object.assign(t, { duration_days: 3, itinerary: [{ day: 1 }, { day: 2 }, { day: 3 }] })
    await expectError(saveTourDetails(db as never, actor, PAGE, { stops: [] }, deps), 409, /one-day tour/)
  })
  it('the FAQ is kept per language: saving French leaves English as it was', async () => {
    await savePageFaq(db as never, actor, PAGE, 'en', [{ question: 'Is lunch included?', answer: 'Yes.' }], deps)
    await savePageFaq(db as never, actor, PAGE, 'fr', [{ question: ' Le déjeuner est-il inclus ? ', answer: 'Oui.' }], deps)
    expect(db.tables.publish_pages.find(p => p.id === PAGE)!.faq).toEqual({
      en: [{ question: 'Is lunch included?', answer: 'Yes.' }],
      fr: [{ question: 'Le déjeuner est-il inclus ?', answer: 'Oui.' }],
    })
  })
  it('a question without its answer, or a language the site does not have, is refused', async () => {
    await expectError(savePageFaq(db as never, actor, PAGE, 'en', [{ question: 'Why?', answer: '' }], deps), 400, /its answer/)
    await expectError(savePageFaq(db as never, actor, PAGE, 'de', [], deps), 400, /website's languages/)
  })
  it('the About text is saved per language of the site, nothing else', async () => {
    await saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope', about: { en: '  We are a family business.\n\nSince 2003.  ', de: 'Nicht unsere Sprache', fr: '' } }, deps)
    expect((db.tables.publish_sites[0].settings as { about: unknown }).about).toEqual({ en: 'We are a family business.\n\nSince 2003.' })
  })
  it('the home headline is saved per language and the year started as a number; both read back', async () => {
    await saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope', headline: { en: '  Egypt, slowly ', de: 'Nein', fr: '' }, foundedYear: '2008' }, deps)
    const settings = db.tables.publish_sites[0].settings as { headline: unknown; foundedYear: unknown; about?: unknown }
    expect(settings.headline).toEqual({ en: 'Egypt, slowly' })
    expect(settings.foundedYear).toBe(2008)
    const look = await lookOf(db as never, actor)
    expect(look.headline).toMatchObject({ en: 'Egypt, slowly' })
    expect(look.foundedYear).toBe(2008)
    await saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope', foundedYear: null }, deps)
    expect((db.tables.publish_sites[0].settings as { foundedYear: unknown }).foundedYear).toBeNull()
  })
  it('the About page\'s headline, people and hours are saved; only this company\'s own uploads are accepted as photos', async () => {
    const own = `https://x.supabase.co/storage/v1/object/public/publish-media/${actor.tenantId}/a.jpg`
    await saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope',
      aboutHeadline: { en: ' Since 2008. ', de: 'Nein' }, teamPhoto: own,
      people: [{ name: ' Mona ', role: 'Egyptologist', kind: 'guide', languages: ['en', 'xx-bad', 'es'], photo: own }, { name: '', role: 'nobody' }],
      hours: { opens: '09:00', closes: '21:00', days: ['mon', 'sun'] } }, deps)
    const st = db.tables.publish_sites[0].settings as Record<string, unknown>
    expect(st.aboutHeadline).toEqual({ en: 'Since 2008.' })
    expect(st.teamPhoto).toBe(own)
    expect(st.people).toEqual([{ name: 'Mona', role: 'Egyptologist', kind: 'guide', languages: ['en', 'es'], photo: own }])
    expect(st.hours).toEqual({ opens: '09:00', closes: '21:00', days: ['mon', 'sun'] })
    const look = await lookOf(db as never, actor)
    expect(look.people).toHaveLength(1)
    expect(look.hours).toEqual({ opens: '09:00', closes: '21:00', days: ['mon', 'sun'] })
    await expectError(saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope', teamPhoto: 'https://elsewhere.example/a.jpg' }, deps), 400, /Upload the team photo/)
    const foreign = 'https://x.supabase.co/storage/v1/object/public/publish-media/another-company/a.jpg'
    await expectError(saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope', people: [{ name: 'Mona', photo: foreign }] }, deps), 400, /Mona's photo/)
    await expectError(saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope', hours: { opens: '21:00', closes: '09:00', days: ['mon'] } }, deps), 400, /opening time before/)
  })
  it('a website photo must be a PNG, JPEG, WebP or AVIF under 10 MB, and goes into the company\'s own folder', async () => {
    const uploads: string[] = []
    db.tables.publish_media = []
    const storage = Object.assign(db, { storage: { from: () => ({
      upload: async (path: string) => { uploads.push(path); return { error: null } },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/publish-media/${path}` } }),
    }) } })
    const { url } = await uploadPublishMedia(storage as never, actor, { type: 'image/jpeg', size: 1000, bytes: new ArrayBuffer(8) })
    expect(uploads[0]).toMatch(new RegExp(`^${actor.tenantId}/[0-9a-f-]{36}\\.jpg$`))
    expect(isOwnMedia(url, actor.tenantId)).toBe(true)
    // listed with the site's media, so the export carries it
    expect(db.tables.publish_media).toEqual([expect.objectContaining({ tenant_id: actor.tenantId, site_id: db.tables.publish_sites[0].id, storage_path: uploads[0] })])
    await expectError(uploadPublishMedia(storage as never, actor, { type: 'image/svg+xml', size: 10, bytes: new ArrayBuffer(1) }), 400, /PNG, JPEG, WebP or AVIF/)
    await expectError(uploadPublishMedia(storage as never, actor, { type: 'image/png', size: 11 * 1024 * 1024, bytes: new ArrayBuffer(1) }), 400, /under 10 MB/)
  })
  it('a year in the future, or a headline too long for a hero, is refused', async () => {
    await expectError(saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope', foundedYear: new Date().getFullYear() + 1 }, deps), 400, /year you started/)
    await expectError(saveLook(db as never, actor, { archetype: 'modern', palette: undefined, fontPair: 'manrope', headline: { en: 'x'.repeat(121) } }, deps), 400, /headline/)
  })
})
