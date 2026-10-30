import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Publish: one company can never reach another's site (migration 440)
// ============================================
// docs/publish/PLAN.md §4 acceptance: "tenant A cannot read or write tenant
// B's pages, drafts, media or leads". The browser holds the user's own
// Supabase session, so the lock must be the database: this replays every
// migration in Postgres and acts as signed-in people of two companies,
// straight through RLS — as role-write-rules.test.ts does for migration 424.

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')

const STUBS = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, raw_user_meta_data JSONB, banned_until TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid', true), '')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN DEFAULT false);
CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID);
CREATE SCHEMA extensions;
`

type Person = 'aOwner' | 'aManager' | 'aMember' | 'aViewer' | 'bOwner'
let db: PGlite
const T: { A: string; B: string } = { A: '', B: '' }
const who = {} as Record<Person, string>
const ids = {} as Record<string, string>

/** Run `sql` as a signed-in person, through RLS; the error text, or null. */
async function as(person: Person, sql: string): Promise<string | null> {
  try {
    await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('test.uid', '${who[person]}', true); ${sql}; COMMIT;`)
    return null
  } catch (e) {
    await db.exec('ROLLBACK').catch(() => undefined)
    return String((e as Error).message)
  }
}

/** Rows a signed-in person can see. */
async function seen(person: Person, sql: string): Promise<number> {
  const r = await db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('test.uid', '${who[person]}', true);`)
    return tx.query(sql)
  })
  return r.rows.length
}

async function one<T = Record<string, unknown>>(sql: string): Promise<T> {
  return (await db.query(sql)).rows[0] as T
}
async function count(sql: string): Promise<number> {
  return Number((await one<{ n: number }>(sql)).n)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  for (const file of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
    } catch {
      // migration-replay.test.ts owns "every migration applies"; a handful
      // need real Supabase features and are exempt there.
      await db.exec('ROLLBACK').catch(() => undefined)
    }
  }
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth, storage TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT ALL ON storage.objects TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  `)
  // Re-apply 440's own revokes: the blanket grant above stands in for
  // Supabase's default grants, which exist BEFORE a migration runs.
  await db.exec(`
    REVOKE INSERT, UPDATE, DELETE ON public.publish_versions, public.publish_enquiries FROM authenticated;
    REVOKE ALL ON public.publish_wa_refs FROM authenticated;
  `)

  for (const [key, name] of [['A', 'Sillage'], ['B', 'Rival Tours']] as const) {
    T[key] = (await one<{ id: string }>(`INSERT INTO tenants (company_name, contact_email) VALUES ('${name}', '${key}@co.test') RETURNING id`)).id
  }
  const people: Array<[Person, 'A' | 'B', string]> = [
    ['aOwner', 'A', 'owner'], ['aManager', 'A', 'manager'], ['aMember', 'A', 'member'], ['aViewer', 'A', 'viewer'], ['bOwner', 'B', 'owner'],
  ]
  for (const [person, co, role] of people) {
    const id = (await one<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('${person}@p.test') RETURNING id`)).id
    who[person] = id
    await db.exec(`
      DELETE FROM tenant_members WHERE user_id = '${id}';
      INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at) VALUES ('${T[co]}', '${id}', '${role}', 'active', NOW());
      UPDATE user_profiles SET active_tenant_id = '${T[co]}' WHERE id = '${id}';
    `)
  }

  // Each company: a tour, a client, a site with a page, a draft, a version,
  // media and an enquiry — written as the platform (service role).
  for (const co of ['A', 'B'] as const) {
    const t = T[co]
    ids[`tour${co}`] = (await one<{ id: string }>(`INSERT INTO tour_templates (tenant_id, template_code, template_name, tour_type, duration_days)
      VALUES ('${t}', 'T-${co}', 'Tour ${co}', 'day_tour', 1) RETURNING id`)).id
    ids[`client${co}`] = (await one<{ id: string }>(`INSERT INTO clients (tenant_id, full_name) VALUES ('${t}', 'Lead ${co}') RETURNING id`)).id
    ids[`site${co}`] = (await one<{ id: string }>(`INSERT INTO publish_sites (tenant_id, archetype, languages) VALUES ('${t}', 'private_journeys', ARRAY['en','fr']) RETURNING id`)).id
    ids[`page${co}`] = (await one<{ id: string }>(`INSERT INTO publish_pages (tenant_id, site_id, kind, tour_template_id)
      VALUES ('${t}', '${ids[`site${co}`]}', 'tour', '${ids[`tour${co}`]}') RETURNING id`)).id
    await db.exec(`INSERT INTO publish_page_locales (tenant_id, site_id, page_id, language, slug) VALUES ('${t}', '${ids[`site${co}`]}', '${ids[`page${co}`]}', 'en', 'tour-${co.toLowerCase()}')`)
    ids[`draft${co}`] = (await one<{ id: string }>(`INSERT INTO publish_drafts (tenant_id, page_id, language, kind, status, origin)
      VALUES ('${t}', '${ids[`page${co}`]}', 'en', 'narrative', 'in_review', 'engine') RETURNING id`)).id
    ids[`version${co}`] = (await one<{ id: string }>(`INSERT INTO publish_versions (tenant_id, page_id, language, version_no, content, reason, approver_name)
      VALUES ('${t}', '${ids[`page${co}`]}', 'en', 1, '[]', 'approved_draft', 'Owner ${co}') RETURNING id`)).id
    await db.exec(`INSERT INTO publish_media (tenant_id, site_id, storage_path) VALUES ('${t}', '${ids[`site${co}`]}', '${t}/hero.jpg')`)
    await db.exec(`INSERT INTO storage.objects (bucket_id, name) VALUES ('publish-media', '${t}/hero.jpg')`)
    await db.exec(`INSERT INTO publish_enquiries (tenant_id, site_id, page_id, client_id, source, landing_url, campaign)
      VALUES ('${t}', '${ids[`site${co}`]}', '${ids[`page${co}`]}', '${ids[`client${co}`]}', 'web_form', 'https://${co}.test/en/tours/x', 'spring')`)
  }
}, 180_000)

// ---------- the four the plan names: pages, drafts, media, leads ----------

describe('pages', () => {
  it('another company sees none of them', async () => {
    expect(await seen('bOwner', `SELECT 1 FROM publish_pages WHERE tenant_id = '${T.A}'`)).toBe(0)
    expect(await seen('bOwner', `SELECT 1 FROM publish_page_locales WHERE tenant_id = '${T.A}'`)).toBe(0)
    expect(await seen('aMember', `SELECT 1 FROM publish_pages`)).toBe(1) // its own, only
  })
  it('another company cannot add, change or delete them', async () => {
    expect(await as('bOwner', `INSERT INTO publish_pages (tenant_id, site_id, kind) VALUES ('${T.A}', '${ids.siteA}', 'about')`)).toMatch(/row-level security/)
    await as('bOwner', `UPDATE publish_pages SET blocks = '["hacked"]' WHERE id = '${ids.pageA}'`)
    await as('bOwner', `DELETE FROM publish_pages WHERE id = '${ids.pageA}'`)
    expect(await count(`SELECT count(*) n FROM publish_pages WHERE id = '${ids.pageA}' AND blocks = '[]'`)).toBe(1)
  })
  it('a company cannot hang its own page on another company\'s site or tour', async () => {
    expect(await as('bOwner', `INSERT INTO publish_pages (tenant_id, site_id, kind) VALUES ('${T.B}', '${ids.siteA}', 'about')`)).toMatch(/foreign key|site_id belongs to another company/)
    expect(await as('bOwner', `INSERT INTO publish_pages (tenant_id, site_id, kind, tour_template_id) VALUES ('${T.B}', '${ids.siteB}', 'tour', '${ids.tourA}')`))
      .toMatch(/tour_template_id belongs to another company/)
  })
  it('nor move an existing page onto another company\'s tour', async () => {
    expect(await as('aManager', `UPDATE publish_pages SET tour_template_id = '${ids.tourB}' WHERE id = '${ids.pageA}'`))
      .toMatch(/tour_template_id belongs to another company/)
  })
  it('within the company, managers configure pages; members and viewers do not', async () => {
    expect(await as('aManager', `INSERT INTO publish_pages (tenant_id, site_id, kind) VALUES ('${T.A}', '${ids.siteA}', 'about')`)).toBeNull()
    expect(await as('aMember', `INSERT INTO publish_pages (tenant_id, site_id, kind) VALUES ('${T.A}', '${ids.siteA}', 'contact')`)).toMatch(/row-level security/)
    expect(await as('aViewer', `INSERT INTO publish_pages (tenant_id, site_id, kind) VALUES ('${T.A}', '${ids.siteA}', 'contact')`)).toMatch(/row-level security/)
  })
})

describe('drafts and versions', () => {
  it('another company sees and changes none of them', async () => {
    expect(await seen('bOwner', `SELECT 1 FROM publish_drafts WHERE tenant_id = '${T.A}'`)).toBe(0)
    expect(await seen('bOwner', `SELECT 1 FROM publish_versions WHERE tenant_id = '${T.A}'`)).toBe(0)
    await as('bOwner', `UPDATE publish_drafts SET content = '[{"type":"text","text":"x"}]' WHERE id = '${ids.draftA}'`)
    await as('bOwner', `DELETE FROM publish_drafts WHERE id = '${ids.draftA}'`)
    expect(await count(`SELECT count(*) n FROM publish_drafts WHERE id = '${ids.draftA}' AND content = '[]'`)).toBe(1)
    expect(await as('bOwner', `INSERT INTO publish_drafts (tenant_id, page_id, language, kind) VALUES ('${T.B}', '${ids.pageA}', 'en', 'narrative')`))
      .toMatch(/foreign key/)
  })
  it('a member drafts; nobody signed in approves — approval is the server\'s, after its role check', async () => {
    expect(await as('aMember', `INSERT INTO publish_drafts (tenant_id, page_id, language, kind) VALUES ('${T.A}', '${ids.pageA}', 'en', 'seo')`)).toBeNull()
    expect(await as('aMember', `INSERT INTO publish_drafts (tenant_id, page_id, language, kind, status) VALUES ('${T.A}', '${ids.pageA}', 'en', 'seo', 'approved')`))
      .toMatch(/row-level security/)
    expect(await as('aOwner', `UPDATE publish_drafts SET status = 'approved' WHERE id = '${ids.draftA}'`)).toMatch(/row-level security/)
    expect(await as('aViewer', `INSERT INTO publish_drafts (tenant_id, page_id, language, kind) VALUES ('${T.A}', '${ids.pageA}', 'en', 'seo')`)).toMatch(/row-level security/)
  })
  it('nobody signed in writes a version; nobody at all rewrites one', async () => {
    expect(await as('aOwner', `INSERT INTO publish_versions (tenant_id, page_id, language, version_no, content, reason, approver_name)
      VALUES ('${T.A}', '${ids.pageA}', 'en', 2, '[]', 'approved_draft', 'me')`)).toMatch(/permission denied/)
    await expect(db.exec(`UPDATE publish_versions SET content = '["edited"]' WHERE id = '${ids.versionA}'`))
      .rejects.toThrow(/cannot be changed/)
  })
  it('an approved-draft version must name its approver', async () => {
    await expect(db.exec(`INSERT INTO publish_versions (tenant_id, page_id, language, version_no, content, reason)
      VALUES ('${T.A}', '${ids.pageA}', 'en', 9, '[]', 'approved_draft')`)).rejects.toThrow(/approved_by_a_person/)
  })
  it('a page can only go live on its own version, in its own language', async () => {
    await expect(db.exec(`UPDATE publish_page_locales SET current_version_id = '${ids.versionB}' WHERE page_id = '${ids.pageA}'`))
      .rejects.toThrow(/foreign key/)
    await db.exec(`UPDATE publish_page_locales SET current_version_id = '${ids.versionA}', is_published = true WHERE page_id = '${ids.pageA}' AND language = 'en'`)
  })
})

describe('media', () => {
  it('another company sees none of the rows', async () => {
    expect(await seen('bOwner', `SELECT 1 FROM publish_media WHERE tenant_id = '${T.A}'`)).toBe(0)
  })
  it('another company cannot upload into, replace or delete from the company\'s folder', async () => {
    expect(await as('bOwner', `INSERT INTO storage.objects (bucket_id, name) VALUES ('publish-media', '${T.A}/planted.jpg')`)).toMatch(/row-level security/)
    await as('bOwner', `DELETE FROM storage.objects WHERE bucket_id = 'publish-media' AND name = '${T.A}/hero.jpg'`)
    await as('bOwner', `UPDATE storage.objects SET name = '${T.A}/renamed.jpg' WHERE name = '${T.A}/hero.jpg'`)
    expect(await count(`SELECT count(*) n FROM storage.objects WHERE name = '${T.A}/hero.jpg'`)).toBe(1)
  })
  it('cannot record a file that sits in another company\'s folder', async () => {
    expect(await as('bOwner', `INSERT INTO publish_media (tenant_id, site_id, storage_path) VALUES ('${T.B}', '${ids.siteB}', '${T.A}/hero2.jpg')`))
      .toMatch(/publish_media_in_own_folder/)
  })
  it('a member uploads to their own company; a viewer does not', async () => {
    expect(await as('aMember', `INSERT INTO storage.objects (bucket_id, name) VALUES ('publish-media', '${T.A}/new.jpg')`)).toBeNull()
    expect(await as('aMember', `INSERT INTO publish_media (tenant_id, site_id, storage_path) VALUES ('${T.A}', '${ids.siteA}', '${T.A}/new.jpg')`)).toBeNull()
    expect(await as('aViewer', `INSERT INTO storage.objects (bucket_id, name) VALUES ('publish-media', '${T.A}/viewer.jpg')`)).toMatch(/row-level security/)
  })
})

describe('leads (enquiries)', () => {
  it('another company sees none of them', async () => {
    expect(await seen('bOwner', `SELECT 1 FROM publish_enquiries WHERE tenant_id = '${T.A}'`)).toBe(0)
    expect(await seen('aViewer', `SELECT 1 FROM publish_enquiries`)).toBe(1)
  })
  it('nobody signed in writes or alters one — enquiries come in through the server', async () => {
    expect(await as('bOwner', `INSERT INTO publish_enquiries (tenant_id, source) VALUES ('${T.A}', 'web_form')`)).toMatch(/permission denied/)
    expect(await as('aOwner', `INSERT INTO publish_enquiries (tenant_id, source) VALUES ('${T.A}', 'web_form')`)).toMatch(/permission denied/)
    expect(await as('aOwner', `DELETE FROM publish_enquiries`)).toMatch(/permission denied/)
  })
  it('even the server cannot file one company\'s enquiry against another\'s client, page or site', async () => {
    await expect(db.exec(`INSERT INTO publish_enquiries (tenant_id, client_id, source) VALUES ('${T.B}', '${ids.clientA}', 'whatsapp')`))
      .rejects.toThrow(/client_id belongs to another company/)
    await expect(db.exec(`INSERT INTO publish_enquiries (tenant_id, page_id, source) VALUES ('${T.B}', '${ids.pageA}', 'web_form')`))
      .rejects.toThrow(/page_id belongs to another company/)
    await expect(db.exec(`INSERT INTO publish_enquiries (tenant_id, site_id, source) VALUES ('${T.B}', '${ids.siteA}', 'concierge_bot')`))
      .rejects.toThrow(/site_id belongs to another company/)
  })
  it('WhatsApp reference tokens are server-only', async () => {
    await db.exec(`INSERT INTO publish_wa_refs (token, tenant_id, site_id) VALUES ('Ab12Cd34', '${T.A}', '${ids.siteA}')`)
    expect(await as('aOwner', `SELECT * FROM publish_wa_refs`)).toMatch(/permission denied/)
  })
})

// ---------- the rest of the model ----------

describe('cancellation policies (migration 441)', () => {
  it('stay inside the company; viewers do not write them; a tour cannot use another company\'s', async () => {
    expect(await as('aMember', `INSERT INTO cancellation_policies (tenant_id, name, is_default, tiers) VALUES ('${T.A}', 'Standard', true, '[{"days_before":30,"charge_percent":25}]')`)).toBeNull()
    expect(await seen('bOwner', `SELECT 1 FROM cancellation_policies WHERE tenant_id = '${T.A}'`)).toBe(0)
    expect(await as('aViewer', `INSERT INTO cancellation_policies (tenant_id, name) VALUES ('${T.A}', 'Viewer terms')`)).toMatch(/row-level security/)
    expect(await as('bOwner', `INSERT INTO cancellation_policies (tenant_id, name) VALUES ('${T.A}', 'Planted')`)).toMatch(/row-level security/)
    const policyA = (await one<{ id: string }>(`SELECT id FROM cancellation_policies WHERE tenant_id = '${T.A}'`)).id
    await expect(db.exec(`UPDATE tour_templates SET cancellation_policy_id = '${policyA}' WHERE id = '${ids.tourB}'`))
      .rejects.toThrow(/belongs to another company/)
    await db.exec(`UPDATE tour_templates SET cancellation_policy_id = '${policyA}', departure_days = '{mon,fri}' WHERE id = '${ids.tourA}'`)
    await expect(db.exec(`INSERT INTO cancellation_policies (tenant_id, name, is_default) VALUES ('${T.A}', 'Second default', true)`))
      .rejects.toThrow(/cancellation_policies_one_default/)
  })
})

describe('sites, domains, glossary, redirects', () => {
  it('creating a site enrolled its company in sync health, with the fact-only rule on', async () => {
    expect(await count(`SELECT count(*) n FROM publish_sync_health WHERE tenant_id IN ('${T.A}', '${T.B}')`)).toBe(2)
    expect(await count(`SELECT count(*) n FROM publish_rules WHERE rule_type = 'auto_publish_fact_only' AND enabled`)).toBe(2)
  })
  it('a site\'s languages are English plus at most one left-to-right language', async () => {
    const lang = (l: string) => db.exec(`UPDATE publish_sites SET languages = ${l} WHERE id = '${ids.siteB}'`)
    await expect(lang(`ARRAY['en','ar']`)).rejects.toThrow(/publish_sites_languages/)
    await expect(lang(`ARRAY['en','fr','es']`)).rejects.toThrow(/publish_sites_languages/)
    await expect(lang(`ARRAY['fr']`)).rejects.toThrow(/publish_sites_languages/)
    await expect(lang(`ARRAY['en','en']`)).rejects.toThrow(/publish_sites_languages/)
    await lang(`ARRAY['en','es']`)
  })
  it('a manager edits the brand; a member does not; nobody signed in creates a site', async () => {
    expect(await as('aManager', `UPDATE publish_sites SET brand = '{"tone":"warm"}' WHERE id = '${ids.siteA}'`)).toBeNull()
    await as('aMember', `UPDATE publish_sites SET brand = '{"tone":"loud"}' WHERE id = '${ids.siteA}'`)
    expect((await one<{ brand: { tone: string } }>(`SELECT brand FROM publish_sites WHERE id = '${ids.siteA}'`)).brand.tone).toBe('warm')
    await as('bOwner', `UPDATE publish_sites SET brand = '{"tone":"rival"}' WHERE id = '${ids.siteA}'`)
    expect((await one<{ brand: { tone: string } }>(`SELECT brand FROM publish_sites WHERE id = '${ids.siteA}'`)).brand.tone).toBe('warm')
    expect(await as('aOwner', `DELETE FROM publish_sites WHERE id = '${ids.siteA}'`)).toBeNull() // no policy: nothing deleted
    expect(await count(`SELECT count(*) n FROM publish_sites WHERE id = '${ids.siteA}'`)).toBe(1)
  })
  it('a hostname belongs to one company; managers add it, the server verifies it', async () => {
    expect(await as('aManager', `INSERT INTO publish_domains (tenant_id, site_id, hostname) VALUES ('${T.A}', '${ids.siteA}', 'test.sillage.example')`)).toBeNull()
    expect(await as('bOwner', `INSERT INTO publish_domains (tenant_id, site_id, hostname) VALUES ('${T.B}', '${ids.siteB}', 'test.sillage.example')`))
      .toMatch(/publish_domains_hostname_unique/)
    expect(await as('aManager', `INSERT INTO publish_domains (tenant_id, site_id, hostname, kind, status) VALUES ('${T.A}', '${ids.siteA}', 'www.sillage.example', 'alias_redirect', 'active')`))
      .toMatch(/row-level security/)
    expect(await as('aManager', `UPDATE publish_domains SET status = 'active' WHERE hostname = 'test.sillage.example'`)).toBeNull()
    expect((await one<{ status: string }>(`SELECT status FROM publish_domains WHERE hostname = 'test.sillage.example'`)).status).toBe('pending_dns')
    expect(await seen('bOwner', `SELECT 1 FROM publish_domains WHERE tenant_id = '${T.A}'`)).toBe(0)
    expect((await one<{ ok: boolean }>(`SELECT publish_hostname_available('TEST.sillage.example') ok`)).ok).toBe(false)
    expect(await as('aManager', `INSERT INTO publish_domains (tenant_id, site_id, hostname) VALUES ('${T.A}', '${ids.siteA}', 'Bad_Host')`))
      .toMatch(/publish_domains_hostname_shape/)
  })
  it('glossary and redirects stay inside the company', async () => {
    expect(await as('aMember', `INSERT INTO publish_glossary (tenant_id, term_key, kind, language, spelling) VALUES ('${T.A}', 'karnak', 'site', 'fr', 'Karnak')`)).toBeNull()
    expect(await seen('bOwner', `SELECT 1 FROM publish_glossary WHERE tenant_id = '${T.A}'`)).toBe(0)
    expect(await as('bOwner', `INSERT INTO publish_redirects (tenant_id, site_id, from_path, to_path) VALUES ('${T.A}', '${ids.siteA}', '/old', '/en')`)).toMatch(/row-level security/)
  })
  it('deleting a site leaves the agency\'s enquiries, and stops its sync', async () => {
    await db.exec(`DELETE FROM publish_sites WHERE id = '${ids.siteB}'`)
    expect(await count(`SELECT count(*) n FROM publish_enquiries WHERE tenant_id = '${T.B}' AND site_id IS NULL AND page_id IS NULL`)).toBe(1)
    expect(await count(`SELECT count(*) n FROM publish_sync_health WHERE tenant_id = '${T.B}'`)).toBe(0)
  })
  it('closing a company deletes every Publish row it had, history included', async () => {
    await db.exec(`SELECT purge_tenant('${T.A}')`)
    for (const t of ['publish_sites', 'publish_pages', 'publish_page_locales', 'publish_drafts', 'publish_versions',
      'publish_media', 'publish_enquiries', 'publish_wa_refs', 'publish_domains', 'publish_glossary', 'publish_sync_health']) {
      expect(await count(`SELECT count(*) n FROM ${t} WHERE tenant_id = '${T.A}'`), t).toBe(0)
    }
  })
})
