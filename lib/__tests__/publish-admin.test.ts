import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTourPage, draftWithEngine, editDraft, approveDraft, rejectDraft, setPublished, pageDetail, slugify, validEditedContent,
  PublishError, type AdminDeps, type Actor,
} from '@/lib/publish/admin'
import type { TourFacts } from '@/lib/publish/contract'

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
  price: { status: 'available', currency: 'EUR', basis: { pax: 2, season: 'lowest' }, from: { perPerson: 70, tier: 'standard', tierLabel: 'Standard' }, byNationality: null, table: [], indicative: [] },
  publishable: { ok: true, reasons: [] },
}

let facts: TourFacts
let deps: AdminDeps
const revalidate = vi.fn(async () => {})

beforeEach(() => {
  seq = 0
  facts = FACTS
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
