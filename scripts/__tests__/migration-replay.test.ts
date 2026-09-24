import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// ============================================
// FROM-SCRATCH MIGRATION REPLAY
// ============================================
// A fresh database is built by replaying supabase/migrations/*.sql in
// order against a fresh database (scripts/migrate.mjs). This test IS that
// install, run in-process against real Postgres (PGlite) with the Supabase
// environment stubbed. Every migration must apply cleanly from scratch —
// append-only and idempotent is the doctrine, and this is its enforcement:
// a new migration that only works against today's prod state fails HERE,
// not on a customer's first install.
//
// The exemption list is CLOSED: each entry depends on a real Supabase
// feature the stub cannot provide, verified by hand. Do not add to it to
// make a new migration pass — fix the migration.

const EXEMPT: Record<string, string> = {
  '004_quote_pdf_storage.sql': 'storage.buckets full column set (Supabase-managed schema)',
  '038_tenant_logos_storage.sql': 'storage.buckets full column set (Supabase-managed schema)',
  '205_copilot_knowledge_vector.sql': 'pgvector extension (available on Supabase, not in PGlite)',
  '261_support_chat.sql': 'supabase_realtime publication (Supabase-managed)',
  '273_revoke_gmail_token_columns.sql': 'self-check asserts live grant state; PGlite default privileges differ',
  '277_unified_messages_security_invoker.sql': 'self-check asserts live grant state; PGlite default privileges differ',
  '283_enable_rls_three_tables.sql': 'self-check counts RLS across tables the exempted files above would have configured',
}

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')

/** The id of a probe client, for the migration-362 trigger checks below. */
async function clientId(db: PGlite, name: string): Promise<string> {
  const r = await db.query(`SELECT id FROM clients WHERE full_name = '${name}'`)
  return (r.rows[0] as { id: string }).id
}


const SUPABASE_STUBS = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, raw_user_meta_data JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN DEFAULT false);
CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID);
CREATE SCHEMA extensions;
`

describe('migration replay from scratch', () => {
  it('every non-exempt migration applies cleanly to a fresh database', async () => {
    const db = new PGlite()
    await db.exec(SUPABASE_STUBS)

    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    expect(files.length).toBeGreaterThan(180)

    const unexpected: Array<{ file: string; message: string }> = []
    const exemptSeen: string[] = []

    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      try {
        await db.exec(sql)
      } catch (error) {
        const message = String((error as Error).message).split('\n')[0]
        if (EXEMPT[file]) exemptSeen.push(file)
        else unexpected.push({ file, message })
        await db.exec('ROLLBACK').catch(() => undefined)
      }
    }

    expect(
      unexpected,
      `Migrations that fail a from-scratch replay (building a fresh database would break here):\n` +
        unexpected.map(u => `  ${u.file}: ${u.message}`).join('\n')
    ).toEqual([])

    // The exemption list must not go stale: every entry still actually fails
    // under the stub (a fixed one should be REMOVED from the list).
    expect(exemptSeen.sort()).toEqual(Object.keys(EXEMPT).sort())

    // Post-replay invariants for migration 327 (localized departments):
    // no shared NULL-tenant departments survive the build, and creating a
    // tenant seeds its own 4 starter departments via trigger — the rows the
    // tenant can actually edit.
    const nullDepts = await db.query(
      'SELECT count(*)::int AS n FROM departments WHERE tenant_id IS NULL'
    )
    expect((nullDepts.rows[0] as { n: number }).n).toBe(0)

    await db.exec(
      "INSERT INTO tenants (company_name, contact_email) VALUES ('Replay Probe Co', 'probe@example.com')"
    )
    const seeded = await db.query(
      "SELECT d.name FROM departments d JOIN tenants t ON t.id = d.tenant_id WHERE t.company_name = 'Replay Probe Co' ORDER BY d.name"
    )
    expect((seeded.rows as Array<{ name: string }>).map(r => r.name)).toEqual([
      'Accounting',
      'Aviation',
      'Execution',
      'Reservation',
    ])

    // Core-table WRITE probes. Replaying DDL proves the schema builds; it
    // does not prove rows can be written — migration 311 dropped
    // parent_supplier_id but left 009's validation trigger reading
    // NEW.parent_supplier_id, and every suppliers INSERT after it failed
    // with 'record "new" has no field' (found by the first real CSV
    // import, not by any test). This probe fails on exactly that class:
    // an orphaned trigger, policy, or constraint on a core table.
    await db.exec(`
      INSERT INTO suppliers (tenant_id, name, company_name, type, status)
      SELECT t.id, 'Replay Probe Supplier', 'Replay Probe Supplier', 'hotel', 'active'
      FROM tenants t WHERE t.company_name = 'Replay Probe Co'
    `)
    const probe = await db.query(
      "SELECT count(*)::int AS n FROM suppliers WHERE name = 'Replay Probe Supplier'"
    )
    expect((probe.rows[0] as { n: number }).n).toBe(1)

    // Migration 362: a lead becomes a Customer when the booking becomes real.
    // The trigger used to be AFTER INSERT ONLY, so a booking whose client was
    // attached later (every B2B booking did) left the client a lead for ever,
    // and a booking INSERTED as cancelled promoted them anyway.
    await db.exec(`
      INSERT INTO clients (tenant_id, full_name, email, status)
      SELECT t.id, 'Lead A', 'a@example.com', 'lead' FROM tenants t WHERE t.company_name = 'Replay Probe Co';
      INSERT INTO clients (tenant_id, full_name, email, status)
      SELECT t.id, 'Lead B', 'b@example.com', 'lead' FROM tenants t WHERE t.company_name = 'Replay Probe Co';
      INSERT INTO clients (tenant_id, full_name, email, status)
      SELECT t.id, 'Lead C', 'c@example.com', 'lead' FROM tenants t WHERE t.company_name = 'Replay Probe Co';
    `)
    const statusOf = async (name: string) => {
      const r = await db.query(`SELECT status FROM clients WHERE full_name = '${name}'`)
      return (r.rows[0] as { status: string }).status
    }
    const booking = (ref: string, withClient: boolean) => `
      INSERT INTO bookings (tenant_id, booking_number, trip_name, start_date, end_date,
                            total_days, num_travelers, total_amount, balance_due, status${withClient ? ', client_id' : ''})
      SELECT t.id, '${ref}', 'Trip', DATE '2027-01-01', DATE '2027-01-05', 5, 2, 1000, 1000, `

    // (a) a live booking promotes on insert, as it always did
    await db.exec(booking('BK-A', true) + `'pending_deposit', '${await clientId(db, 'Lead A')}'::uuid FROM tenants t WHERE t.company_name = 'Replay Probe Co'`)
    expect(await statusOf('Lead A')).toBe('active')

    // (b) a booking inserted with NO client, whose client is attached later
    await db.exec(booking('BK-B', false) + `'pending_deposit' FROM tenants t WHERE t.company_name = 'Replay Probe Co'`)
    expect(await statusOf('Lead B')).toBe('lead')
    await db.exec(`UPDATE bookings SET client_id = '${await clientId(db, 'Lead B')}' WHERE booking_number = 'BK-B'`)
    expect(await statusOf('Lead B'), 'client attached after the insert must still promote').toBe('active')

    // (c) a booking inserted CANCELLED must not promote; confirming it later does
    await db.exec(booking('BK-C', true) + `'cancelled', '${await clientId(db, 'Lead C')}'::uuid FROM tenants t WHERE t.company_name = 'Replay Probe Co'`)
    expect(await statusOf('Lead C'), 'a cancelled booking is not custom').toBe('lead')
    await db.exec(`UPDATE bookings SET status = 'confirmed' WHERE booking_number = 'BK-C'`)
    expect(await statusOf('Lead C')).toBe('active')

    // (d) cancelling afterwards never demotes a Customer
    await db.exec(`UPDATE bookings SET status = 'cancelled' WHERE booking_number = 'BK-C'`)
    expect(await statusOf('Lead C')).toBe('active')

    // Migration 366: which conversations are waiting on US. The rule that
    // matters is that the wait is dated from the customer's FIRST unanswered
    // message, not their newest one.
    await db.exec(`
      INSERT INTO unified_conversations (tenant_id, contact_name, contact_email)
      SELECT t.id, 'Waiting Traveller', 'waiting@example.test' FROM tenants t WHERE t.company_name = 'Replay Probe Co';
    `)
    const convId = (await db.query(
      "SELECT id FROM unified_conversations WHERE contact_name = 'Waiting Traveller'"
    )).rows[0] as { id: string }
    let probeMsg = 0
    const email = (dir: string, at: string, subject: string) => `
      INSERT INTO email_messages (tenant_id, unified_conversation_id, gmail_message_id, direction, from_email, to_email, subject, sent_at, is_read)
      SELECT t.id, '${convId.id}', 'probe-${++probeMsg}', '${dir}', 'a@x.test', 'b@x.test', '${subject}', TIMESTAMPTZ '${at}', true
      FROM tenants t WHERE t.company_name = 'Replay Probe Co';
    `
    const awaiting = async () => {
      const r = await db.query(
        `SELECT last_inbound_at, last_outbound_at, awaiting_reply_since FROM unified_conversations WHERE id = '${convId.id}'`
      )
      return r.rows[0] as { last_inbound_at: Date | null; last_outbound_at: Date | null; awaiting_reply_since: Date | null }
    }

    await db.exec(email('inbound', '2027-05-01 09:00+00', 'Can you quote Egypt?'))
    expect((await awaiting()).awaiting_reply_since?.toISOString()).toBe('2027-05-01T09:00:00.000Z')

    await db.exec(email('inbound', '2027-05-02 09:00+00', 'Still interested'))
    expect(
      (await awaiting()).awaiting_reply_since?.toISOString(),
      'the wait dates from the FIRST unanswered message'
    ).toBe('2027-05-01T09:00:00.000Z')

    await db.exec(email('outbound', '2027-05-03 09:00+00', 'Here is your quote'))
    const answered = await awaiting()
    expect(answered.awaiting_reply_since, 'answered: nothing is waiting').toBeNull()
    expect(answered.last_outbound_at?.toISOString()).toBe('2027-05-03T09:00:00.000Z')

    await db.exec(email('inbound', '2027-05-04 09:00+00', 'One more question'))
    expect((await awaiting()).awaiting_reply_since?.toISOString()).toBe('2027-05-04T09:00:00.000Z')

    // Migration 363: a seeded tour type carries the days it covers, so the
    // form stops rewriting an agency's own type from the duration.
    await db.exec(`
      INSERT INTO tenant_vocabularies (tenant_id, kind, key, label, rank)
      SELECT t.id, 'tour_type', 'package', 'Package', 9 FROM tenants t WHERE t.company_name = 'Replay Probe Co'
    `)
    const ranges = await db.query(`
      SELECT v.key, v.meta FROM tenant_vocabularies v
        JOIN tenants t ON t.id = v.tenant_id
       WHERE t.company_name = 'Replay Probe Co' AND v.kind = 'tour_type'
       ORDER BY v.key
    `)
    const byKey = Object.fromEntries(
      (ranges.rows as Array<{ key: string; meta: Record<string, unknown> }>).map(r => [r.key, r.meta ?? {}])
    )
    expect(byKey.day_tour, 'a day tour covers exactly one day').toMatchObject({ min_days: 1, max_days: 1 })
    expect(byKey.stopover).toMatchObject({ min_days: 1, max_days: 1 })
    expect(byKey.multi_day).toMatchObject({ min_days: 2 })
    expect(byKey.multi_day.max_days, 'multi-day is open-ended').toBeUndefined()
    expect(
      byKey.package,
      "an agency's own type keeps an unknown range, so nothing overwrites it"
    ).toEqual({})

    // Migration 369: naming a supplier this workspace knows IS linking to it.
    // The Hotels page listed eleven hotels with their companies above a card
    // reading "Linked to Company 0" — the rows carried the NAME and no link,
    // so the company filter found none of them. An import is only one door,
    // so the rule lives here, where every door passes.
    await db.exec(`
      INSERT INTO suppliers (tenant_id, name, company_name, type, status)
      SELECT t.id, 'Aracan Hotels & Resorts', 'Aracan Hotels & Resorts', 'hotel', 'active'
      FROM tenants t WHERE t.company_name = 'Replay Probe Co';
      INSERT INTO suppliers (tenant_id, name, company_name, type, status)
      SELECT t.id, 'Twin Name Co', 'Twin Name Co', 'hotel', 'active'
      FROM tenants t WHERE t.company_name = 'Replay Probe Co';
      INSERT INTO suppliers (tenant_id, name, company_name, type, status)
      SELECT t.id, 'Twin Name Co', 'Twin Name Co', 'hotel', 'active'
      FROM tenants t WHERE t.company_name = 'Replay Probe Co';
    `)
    const rateLink = async (code: string) => {
      const r = await db.query(
        `SELECT supplier_id, supplier_name FROM accommodation_rates WHERE service_code = '${code}'`
      )
      return r.rows[0] as { supplier_id: string | null; supplier_name: string | null }
    }
    const rate = (code: string, cols: string, values: string) => `
      INSERT INTO accommodation_rates (tenant_id, service_code, hotel_name, city, ${cols})
      SELECT t.id, '${code}', 'Probe Hotel', 'Luxor', ${values}
      FROM tenants t WHERE t.company_name = 'Replay Probe Co'`

    // (a) a name this workspace knows becomes a link — whatever the spacing
    await db.exec(rate('PROBE-LINK', 'supplier_name', `'  aracan hotels & resorts '`))
    const linked = await rateLink('PROBE-LINK')
    const aracan = await db.query(
      `SELECT id FROM suppliers WHERE name = 'Aracan Hotels & Resorts'`
    )
    expect(linked.supplier_id).toBe((aracan.rows[0] as { id: string }).id)

    // (b) a name nobody here carries stays unlinked — never invented
    await db.exec(rate('PROBE-UNKNOWN', 'supplier_name', `'Accor'`))
    expect((await rateLink('PROBE-UNKNOWN')).supplier_id).toBeNull()
    expect((await rateLink('PROBE-UNKNOWN')).supplier_name).toBe('Accor')

    // (c) two suppliers share the name: only a human can choose
    await db.exec(rate('PROBE-AMBIGUOUS', 'supplier_name', `'Twin Name Co'`))
    expect((await rateLink('PROBE-AMBIGUOUS')).supplier_id).toBeNull()

    // (d) a stated link is never overruled by a name pointing elsewhere
    const twin = await db.query(`SELECT id FROM suppliers WHERE name = 'Twin Name Co' LIMIT 1`)
    const twinId = (twin.rows[0] as { id: string }).id
    await db.exec(rate('PROBE-STATED', 'supplier_id, supplier_name', `'${twinId}'::uuid, 'Aracan Hotels & Resorts'`))
    expect((await rateLink('PROBE-STATED')).supplier_id).toBe(twinId)

    // (e) a link with no name is given the supplier's own name
    await db.exec(rate('PROBE-NAMELESS', 'supplier_id', `'${twinId}'::uuid`))
    expect((await rateLink('PROBE-NAMELESS')).supplier_name).toBe('Twin Name Co')

    // (f) naming a known supplier on an UPDATE links it too
    await db.exec(rate('PROBE-UPDATE', 'supplier_name', `'Accor'`))
    await db.exec(
      `UPDATE accommodation_rates SET supplier_name = 'Aracan Hotels & Resorts' WHERE service_code = 'PROBE-UPDATE'`
    )
    expect((await rateLink('PROBE-UPDATE')).supplier_id).toBe((aracan.rows[0] as { id: string }).id)

    // (g) the rule reaches every table that can name a supplier, not just rates
    const triggered = await db.query(`
      SELECT c.relname FROM pg_trigger g
        JOIN pg_class c ON c.oid = g.tgrelid
       WHERE g.tgname = 'link_supplier_by_name' AND NOT g.tgisinternal
       ORDER BY c.relname
    `)
    expect((triggered.rows as Array<{ relname: string }>).map(r => r.relname)).toEqual([
      'accommodation_rates',
      'activity_rates',
      'airport_staff_rates',
      'booking_supplier_status',
      'expenses',
      'flight_rates',
      'hotel_staff_rates',
      'itinerary_services',
      'meal_rates',
      'nile_cruises',
      'supplier_documents',
      'supplier_invoices',
    ])

    // Migration 370: an attraction alias belongs to the agency whose fee it
    // names. Production had 27 GLOBAL aliases; nine pointed at a name on
    // nobody's sheet and rewrote right wording into a miss, and a global row
    // is one agency's wording imposed on every other.
    const noGlobals = await db.query(`SELECT count(*)::int AS n FROM attraction_aliases WHERE tenant_id IS NULL`)
    expect((noGlobals.rows[0] as { n: number }).n, 'no global alias survives').toBe(0)

    const aliasTenant = await db.query(`
      SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'attraction_aliases' AND column_name = 'tenant_id'`)
    expect((aliasTenant.rows[0] as { is_nullable: string }).is_nullable, 'a global alias cannot come back').toBe('NO')
    await expect(
      db.exec(`INSERT INTO attraction_aliases (tenant_id, alias, canonical) VALUES (NULL, 'sneaks back', 'Nothing')`),
      'the column refuses a row with no agency'
    ).rejects.toThrow()

    const globalRead = await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'attraction_aliases' AND policyname = 'attraction_aliases_global_read'`)
    expect((globalRead.rows[0] as { n: number }).n, 'nobody reads a shared alias any more').toBe(0)

    // The rule that decided who was handed what: does a canonical land on
    // exactly ONE fee of this agency's sheet? The engine's own rule — a fee
    // whose name IS it, else the only one that contains it.
    await db.exec(`
      INSERT INTO entrance_fees (tenant_id, attraction_name, city, eur_rate, non_eur_rate, is_active)
      SELECT t.id, f.name, 'Probe', 10, 10, true
        FROM tenants t, (VALUES
          ('Valley Of Kings'), ('Egyptian Museum'), ('The Grand Egyptian Museum (GEM)'),
          ('Abu Simbel Temple'), ('Abu Simbel Sound & Light'), ('Giza Plateau')
        ) AS f(name)
       WHERE t.company_name = 'Replay Probe Co';
    `)
    const resolves = async (canonical: string) => {
      const r = await db.query(
        `SELECT public.attraction_alias_resolves(t.id, $1) AS ok FROM tenants t WHERE t.company_name = 'Replay Probe Co'`,
        [canonical]
      )
      return (r.rows[0] as { ok: boolean }).ok
    }
    expect(await resolves('Valley Of Kings'), 'a name on the sheet').toBe(true)
    expect(await resolves('valley of kings '), 'whatever the case or padding').toBe(true)
    expect(await resolves('Valley of the Kings'), 'the old global canonical is on NO sheet').toBe(false)
    expect(await resolves('Egyptian Museum'), 'an exact name wins over one that merely contains it').toBe(true)
    expect(await resolves('Abu Simbel'), 'two fees contain it and none IS it — not an alias, a coin toss').toBe(false)
    expect(await resolves('Giza Plateau + Egyptian Museum'), 'a combo lands when every part does').toBe(true)
    expect(await resolves('Giza Plateau + Sphinx Area'), '…and not when one part is on no sheet').toBe(false)
    expect(await resolves(''), 'nothing is not a fee').toBe(false)

    // The statement that hands out the spellings, run against a sheet that
    // HAS fees (when the migration itself replays there is no agency yet, so
    // it copies nothing). Taken from the file, so it is the real one.
    const sql370 = readFileSync(path.join(MIGRATIONS_DIR, '370_attraction_aliases_per_tenant.sql'), 'utf8')
    const spellings = sql370.match(/INSERT INTO attraction_aliases \(tenant_id, alias, canonical\)\nSELECT t\.id, a\.alias, a\.canonical[\s\S]*?DO NOTHING;/)
    expect(spellings, 'the spellings statement is in the migration').not.toBeNull()
    await db.exec(`INSERT INTO tenants (company_name, contact_email) VALUES ('Empty Sheet Co', 'empty@example.com')`)
    await db.exec(spellings![0])
    const handed = async (company: string) => {
      const r = await db.query(
        `SELECT a.alias, a.canonical FROM attraction_aliases a JOIN tenants t ON t.id = a.tenant_id
          WHERE t.company_name = $1 ORDER BY a.alias`, [company])
      return Object.fromEntries((r.rows as Array<{ alias: string; canonical: string }>).map(x => [x.alias, x.canonical]))
    }
    const probeAliases = await handed('Replay Probe Co')
    expect(probeAliases['Valley of the Kings'], 'the spelling its sheet can honour').toBe('Valley Of Kings')
    expect(probeAliases['Abu Simbel'], 'pinned to the temple, not left to chance').toBe('Abu Simbel Temple')
    expect(probeAliases['Citadel'], 'no citadel fee on this sheet, so no alias into thin air').toBeUndefined()
    expect(await handed('Empty Sheet Co'), 'an agency with an empty sheet is handed nothing').toEqual({})
    const before = Object.keys(probeAliases).length
    await db.exec(spellings![0])
    expect(Object.keys(await handed('Replay Probe Co')).length, 'running it twice adds nothing').toBe(before)

    // Migration 371: tour_templates.uses_day_builder is gone. It was the flag
    // the tours page required before pricing a tour at all; nothing has read
    // it since #484, and a column that means nothing but LOOKS like a pricing
    // switch is a trap.
    const dayBuilder = await db.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tour_templates' AND column_name = 'uses_day_builder'`)
    expect((dayBuilder.rows[0] as { n: number }).n, 'the dead flag is dropped').toBe(0)
    // Migration 372: and its twin, pricing_mode — NULL on every live tour.
    const pricingMode = await db.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tour_templates' AND column_name = 'pricing_mode'`)
    expect((pricingMode.rows[0] as { n: number }).n, 'the other dead flag is dropped').toBe(0)

    // Migration 373: bookings.status_override was never this app's column — the
    // sibling product's migration, pasted into this database. No migration
    // here creates it, so on a fresh build it never exists; 373 must be a clean
    // no-op there, and must leave `bookings` usable.
    const override = await db.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'status_override'`)
    expect((override.rows[0] as { n: number }).n, 'no column this repo did not create').toBe(0)
    // And where it DOES exist — production — the statement removes it, and a
    // second run is harmless.
    await db.exec(`ALTER TABLE public.bookings ADD COLUMN status_override jsonb`)
    const sql373 = readFileSync(path.join(MIGRATIONS_DIR, '373_drop_bookings_status_override.sql'), 'utf8')
    await db.exec(sql373)
    await db.exec(sql373)
    const after373 = await db.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'status_override'`)
    expect((after373.rows[0] as { n: number }).n, 'dropped where it exists, twice over').toBe(0)
    // …and a tour can still be created without it.
    await db.exec(`
      INSERT INTO tour_templates (tenant_id, template_code, template_name, tour_type, duration_days)
      SELECT t.id, 'PROBE-371', 'After the flag', 'day_tour', 1 FROM tenants t WHERE t.company_name = 'Replay Probe Co'`)
    const made = await db.query(`SELECT count(*)::int AS n FROM tour_templates WHERE template_code = 'PROBE-371'`)
    expect((made.rows[0] as { n: number }).n).toBe(1)

    // ---- Migration 374: a fresh build has what PRODUCTION has ----
    // types/database.types.ts is generated from production, and the code is
    // typed against it. Until 374, 23 columns in it were built by no migration
    // (added by hand in the SQL editor) — so a database built from this folder
    // was one the app could not run on, and nothing said so. This compares the
    // two, column by column, and is where the NEXT hand-made column fails.
    const typesSrc = readFileSync(path.join(MIGRATIONS_DIR, '..', '..', 'types', 'database.types.ts'), 'utf8')
    const typed = new Map<string, Set<string>>()
    const tableRe = /^ {6}([a-z_0-9]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm
    for (let m = tableRe.exec(typesSrc); m !== null; m = tableRe.exec(typesSrc)) {
      typed.set(m[1], new Set(m[2].split('\n').flatMap(l => l.match(/^ {10}([a-z_0-9]+)\??:/)?.[1] ?? [])))
    }
    expect(typed.size, 'the generated types were parsed').toBeGreaterThan(130)

    const builtCols = await db.query(`
      SELECT c.table_name AS t, c.column_name AS col
        FROM information_schema.columns c
        JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
       WHERE c.table_schema = 'public' AND tb.table_type IN ('BASE TABLE', 'VIEW')`) // the generator lists views as tables
    const built = new Map<string, Set<string>>()
    for (const r of builtCols.rows as Array<{ t: string; col: string }>) {
      if (!built.has(r.t)) built.set(r.t, new Set())
      built.get(r.t)!.add(r.col)
    }

    // Tables only the exempt migrations (205, 261) can build.
    const ONLY_ON_SUPABASE = ['copilot_knowledge', 'support_conversations', 'support_messages']
    // Columns on production with no migration and no code. 374 left two here;
    // 376 dropped them. EMPTY is the rule: a new entry means someone added a
    // column by hand — write its migration (or drop it) instead of listing it.
    const STRAYS_ON_PRODUCTION: string[] = []

    expect(
      [...typed.keys()].filter(t => !built.has(t)).sort(),
      'tables production has that no migration here builds'
    ).toEqual(ONLY_ON_SUPABASE)
    expect(
      [...built.keys()].filter(t => !typed.has(t)).sort(),
      'tables a fresh build has that production (the types) does not — regenerate the types, or the migration is unapplied'
    ).toEqual([])

    const missingFromBuild: string[] = []
    const missingFromProduction: string[] = []
    for (const [table, cols] of typed) {
      const mine = built.get(table)
      if (!mine) continue
      for (const c of cols) if (!mine.has(c)) missingFromBuild.push(`${table}.${c}`)
      for (const c of mine) if (!cols.has(c)) missingFromProduction.push(`${table}.${c}`)
    }
    expect(
      missingFromBuild.sort(),
      'columns production has that NO migration creates — someone added them by hand. Write the migration (ADD COLUMN IF NOT EXISTS).'
    ).toEqual(STRAYS_ON_PRODUCTION)
    expect(
      missingFromProduction.sort(),
      'columns a fresh build has that production does not — an unapplied migration, or types that need regenerating'
    ).toEqual([])

    // What 374 aligned besides columns.
    const zeroDefaults = await db.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'accommodation_rates'
         AND column_name ~ '(ppd|single_supplement|triple_reduction)_(non_)?eur$' AND column_default IS NOT NULL`)
    expect((zeroDefaults.rows[0] as { n: number }).n, 'a hotel rate saved without a price must be NULL (a hole), never 0 (a free hotel)').toBe(0)

    const indexNames = new Set(((await db.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
    )).rows as Array<{ indexname: string }>).map(r => r.indexname))
    for (const name of ['idx_commissions_tenant', 'idx_commissions_type', 'idx_tour_quotes_tenant', 'idx_content_library_route', 'idx_itinerary_days_cruise_day']) {
      expect(indexNames.has(name), `${name} — production's index, under production's name`).toBe(true)
    }
    for (const name of ['idx_commissions_tenant_id', 'idx_invoices_date']) {
      expect(indexNames.has(name), `${name} — the second name for an index that is already there`).toBe(false)
    }
    // NOT adopted by 374, and removed from production by 375: numbers unique
    // across ALL agencies. Per agency is the rule (360 did this for tour codes).
    for (const name of ['invoices_invoice_number_key', 'expenses_expense_number_key', 'supplier_invoices_internal_reference_key']) {
      expect(indexNames.has(name), `${name} would stop a second agency issuing its first document`).toBe(false)
    }

    // ---- Migration 380: guide modes ----
    const modes = await db.query(`SELECT key FROM tenant_vocabularies WHERE kind = 'guide_mode' AND tenant_id = (SELECT id FROM tenants WHERE company_name = 'Replay Probe Co') ORDER BY rank`)
    expect((modes.rows as Array<{ key: string }>).map(r => r.key), 'a tenant made after 380 has both modes').toEqual(['spot', 'throughout'])
    const modeCol = await db.query(`SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'guide_rates' AND column_name = 'guide_mode'`)
    expect(modeCol.rows[0]).toMatchObject({ column_default: "'spot'::character varying", is_nullable: 'NO' })
    await expect(db.exec(`INSERT INTO guide_rates (tenant_id, service_code, guide_language, guide_type, tour_duration, guide_mode) VALUES ((SELECT id FROM tenants WHERE company_name = 'Replay Probe Co'), 'P380', 'english', 'egyptologist', 'full_day', 'Bad Mode')`), 'a mode must be a key').rejects.toThrow()
    await db.exec('ROLLBACK').catch(() => undefined)

    // ---- Migration 379: the default price becomes period 1 ----
    // A fresh build has no rates, so production's state is MADE: a hotel priced
    // from its room columns, a cruise from its base columns, a hotel with no
    // price, a row with no dates, and one that already has periods.
    const m379 = readFileSync(path.join(MIGRATIONS_DIR, '379_rates_are_dated_periods.sql'), 'utf8')
    const T = `(SELECT id FROM tenants WHERE company_name = 'Replay Probe Co')`
    await db.exec(`
      INSERT INTO accommodation_rates (tenant_id, service_code, property_name, city, tier, double_rate_eur, single_rate_eur, rate_valid_from, rate_valid_to) VALUES
        (${T}, 'P379-ROOM',   'Room Rate Hotel', 'Cairo', 'standard', 200, 150, DATE '2026-04-01', DATE '2027-04-30'),
        (${T}, 'P379-NOPRICE','No Price Hotel',  'Cairo', 'luxury',   NULL, NULL, DATE '2026-04-01', DATE '2027-04-30'),
        (${T}, 'P379-NODATES','No Dates Hotel',  'Cairo', 'standard', 200, 150, NULL, NULL);
      INSERT INTO accommodation_rates (tenant_id, service_code, property_name, city, tier, ppd_eur, rate_valid_from, rate_valid_to, seasons) VALUES
        (${T}, 'P379-HAS',    'Already Periods', 'Cairo', 'standard', 90, DATE '2026-04-01', DATE '2027-04-30',
         '[{"name":"Winter","from":"2026-11-01","to":"2027-02-28","rates":{"ppd_eur":90}}]'::jsonb);
      INSERT INTO nile_cruises (tenant_id, cruise_code, ship_name, tier, ppd_eur, single_supplement_eur, rate_valid_from, rate_valid_to) VALUES
        (${T}, 'P379-SHIP', 'MS Probe', 'standard', 120, 40, DATE '2026-10-01', DATE '2027-04-30');
    `)
    await db.exec(m379)
    const period = async (table: string, codeCol: string, code: string) =>
      ((await db.query(`SELECT seasons, ppd_eur::float8 AS ppd_eur, single_supplement_eur::float8 AS supp FROM ${table} WHERE ${codeCol} = $1`, [code])).rows[0]) as
        { seasons: Array<{ name: string; from: string; to: string; rates: Record<string, number> }> | null; ppd_eur: number | null; supp: number | null }
    const room = await period('accommodation_rates', 'service_code', 'P379-ROOM')
    expect(room.seasons, 'one period, the row’s own dates').toHaveLength(1)
    expect(room.seasons![0]).toMatchObject({ name: 'Contract rate', from: '2026-04-01', to: '2027-04-30' })
    expect(room.seasons![0].rates, 'half the double room, and the single room’s difference — what the engine charged').toMatchObject({ ppd_eur: 100, single_supplement_eur: 50, triple_reduction_eur: 0, ppd_non_eur: 100, guide_rate_eur: 0 })
    expect(room.ppd_eur, 'the base column is period 1 too, for date-less readers').toBe(100)
    expect((await period('accommodation_rates', 'service_code', 'P379-NOPRICE')).seasons, 'no price: left alone — a gap before, a gap after').toBeNull()
    expect((await period('accommodation_rates', 'service_code', 'P379-NODATES')).seasons, 'no validity dates: no window to give it').toBeNull()
    expect((await period('accommodation_rates', 'service_code', 'P379-HAS')).seasons![0].name, 'a rate that has periods is never touched').toBe('Winter')
    const shipRow = await period('nile_cruises', 'cruise_code', 'P379-SHIP')
    expect(shipRow.seasons![0]).toMatchObject({ name: 'Contract rate', from: '2026-10-01', to: '2027-04-30' })
    expect(shipRow.seasons![0].rates).toMatchObject({ ppd_eur: 120, single_supplement_eur: 40, ppd_non_eur: 120 })
    const once = JSON.stringify(room.seasons)
    await db.exec(m379) // again: nothing left to convert, nothing re-written
    expect(JSON.stringify((await period('accommodation_rates', 'service_code', 'P379-ROOM')).seasons)).toBe(once)
    await db.exec(`DELETE FROM accommodation_rates WHERE service_code LIKE 'P379-%'; DELETE FROM nile_cruises WHERE cruise_code = 'P379-SHIP'`)

    // ---- Migration 378: a cruise's length has no default ----
    // 106 gave the column DEFAULT '[4]': a cruise saved without a length became
    // a four-night one, and the length is what turns a per-trip price into a
    // nightly one. A fresh build must not bring that back.
    const cruiseLengthDefault = await db.query(`
      SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'nile_cruises' AND column_name = 'duration_nights'`)
    expect((cruiseLengthDefault.rows[0] as { column_default: string | null }).column_default, 'no invented cruise length').toBeNull()

    // ---- Migration 377: one of each index ----
    // Production has fourteen booking indexes twice (by hand, then again as
    // *_v2 from migration 100). A fresh build only ever had the _v2 set, so
    // production's state is MADE here before 377 runs.
    const m377 = readFileSync(path.join(MIGRATIONS_DIR, '377_one_of_each_index.sql'), 'utf8')
    const indexExists = async (name: string) =>
      ((await db.query("SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1", [name])).rows.length) > 0
    const SPARES: Array<[string, string]> = [
      ['idx_bookings_tenant', 'bookings (tenant_id)'], ['idx_bookings_status', 'bookings (status)'],
      ['idx_bookings_dates', 'bookings (start_date, end_date)'], ['idx_bookings_client', 'bookings (client_id)'],
      ['idx_bookings_partner', 'bookings (partner_id)'], ['idx_bookings_itinerary', 'bookings (itinerary_id)'],
      ['idx_bookings_booking_date', 'bookings (booking_date DESC)'],
      ['idx_passengers_booking', 'booking_passengers (booking_id)'], ['idx_passengers_tenant', 'booking_passengers (tenant_id)'],
      ['idx_passengers_lead', 'booking_passengers (is_lead_passenger) WHERE is_lead_passenger = true'],
      ['idx_booking_payments_booking', 'booking_payments (booking_id)'], ['idx_booking_payments_tenant', 'booking_payments (tenant_id)'],
      ['idx_booking_payments_status', 'booking_payments (status)'], ['idx_booking_payments_date', 'booking_payments (payment_date DESC)'],
    ]
    // The fresh build has already run 377 once (in the replay above): the five
    // indexes no query uses are gone, the _v2 set is untouched.
    for (const name of ['idx_usage_current', 'idx_content_library_created_by', 'idx_writing_rules_category', 'idx_itineraries_cost_mode', 'idx_itinerary_services_code']) {
      expect(await indexExists(name), `${name} — nothing queries by it`).toBe(false)
    }
    expect(await indexExists('idx_usage_tenant_period_end'), 'the index idx_usage_current duplicated stays').toBe(true)

    for (const [name, on] of SPARES) await db.exec(`CREATE INDEX ${name} ON ${on}`)
    // One spare is NOT a copy: same name as production's, different columns.
    // And one has lost its twin. Neither may go.
    await db.exec('DROP INDEX idx_bookings_status; CREATE INDEX idx_bookings_status ON bookings (status, tenant_id)')
    await db.exec('DROP INDEX idx_passengers_tenant_v2')
    await db.exec(m377)
    for (const [name] of SPARES) {
      const kept = name === 'idx_bookings_status' || name === 'idx_passengers_tenant'
      expect(await indexExists(name), kept ? `${name} is not a spare copy — it stays` : `${name} is the second copy — it goes`).toBe(kept)
      if (name !== 'idx_passengers_tenant') expect(await indexExists(`${name}_v2`), `${name}_v2 is the one a migration builds — it stays`).toBe(true)
    }
    // Back to a fresh build's state, then once more: nothing left to do.
    await db.exec('DROP INDEX idx_bookings_status; ALTER INDEX idx_passengers_tenant RENAME TO idx_passengers_tenant_v2')
    await db.exec(m377)

    // ---- Migration 376: the two stray columns go — unless they hold something ----
    // A fresh build never had them, so production's state is MADE here.
    const m376 = readFileSync(path.join(MIGRATIONS_DIR, '376_drop_stray_columns.sql'), 'utf8')
    const hasColumn = async (table: string, column: string) =>
      ((await db.query('SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3', ['public', table, column])).rows.length) > 0
    await db.exec('ALTER TABLE itineraries ADD COLUMN cabin_allocation JSONB; ALTER TABLE content_library ADD COLUMN content_type VARCHAR(50)')
    await db.exec("INSERT INTO content_library (tenant_id, name, content_type) SELECT id, 'Stray probe', 'article' FROM tenants WHERE company_name = 'Replay Probe Co'")
    await expect(db.exec(m376), 'a value turned up since it was checked').rejects.toThrow(/content_library\.content_type holds 1 value/)
    await db.exec('ROLLBACK').catch(() => undefined)
    expect(await hasColumn('itineraries', 'cabin_allocation'), 'a refusal drops NOTHING — not even the column that was empty').toBe(true)
    await db.exec("DELETE FROM content_library WHERE name = 'Stray probe'")
    await db.exec(m376)
    expect(await hasColumn('itineraries', 'cabin_allocation')).toBe(false)
    expect(await hasColumn('content_library', 'content_type')).toBe(false)
    await db.exec(m376) // nothing left to do

    // ---- Migration 375: a document number is unique PER AGENCY ----
    // A fresh build never had the three global constraints, so 375 is a no-op
    // here. To test what it does on production, production's state is MADE:
    // the global constraints are added by hand, the defect is shown, then 375
    // runs. Two agencies, each issuing its own first document of the year.
    const m375 = readFileSync(path.join(MIGRATIONS_DIR, '375_document_numbers_unique_per_agency.sql'), 'utf8')
    await db.exec("INSERT INTO tenants (company_name, contact_email) VALUES ('Numbering Probe A', 'a@numbering.test'), ('Numbering Probe B', 'b@numbering.test')")
    const firstDocs = (who: 'A' | 'B') => {
      const tenant = `(SELECT id FROM tenants WHERE company_name = 'Numbering Probe ${who}')`
      return [
        `INSERT INTO invoices (tenant_id, invoice_number, client_name, line_items, total_amount, balance_due, issue_date)
           VALUES (${tenant}, 'INV-2027-001', 'Probe', '[]'::jsonb, 100, 100, DATE '2027-01-05')`,
        `INSERT INTO expenses (tenant_id, expense_number, category, amount, expense_date)
           VALUES (${tenant}, 'EXP-2027-001', 'other', 10, DATE '2027-01-05')`,
        `INSERT INTO supplier_invoices (tenant_id, supplier_invoice_number, supplier_name, invoice_date, amount, internal_reference)
           VALUES (${tenant}, 'S-1', 'Probe Supplier', DATE '2027-01-05', 10, 'SI-2027-001')`,
      ]
    }
    const GLOBALS: Array<[string, string, string]> = [
      ['invoices', 'invoices_invoice_number_key', 'invoice_number'],
      ['expenses', 'expenses_expense_number_key', 'expense_number'],
      ['supplier_invoices', 'supplier_invoices_internal_reference_key', 'internal_reference'],
    ]
    const asOnProduction = async () => {
      for (const [table, name, column] of GLOBALS) await db.exec(`ALTER TABLE ${table} ADD CONSTRAINT ${name} UNIQUE (${column})`)
    }
    const hasConstraint = async (name: string) =>
      ((await db.query('SELECT 1 FROM pg_constraint WHERE conname = $1', [name])).rows.length) > 0

    await asOnProduction()
    for (const sql of firstDocs('A')) await db.exec(sql)
    for (const sql of firstDocs('B')) {
      await expect(db.exec(sql), 'the defect: agency B is refused the number agency A holds').rejects.toThrow(/duplicate key/)
    }

    await db.exec(m375)
    for (const [, name] of GLOBALS) expect(await hasConstraint(name), `${name} is gone`).toBe(false)
    for (const sql of firstDocs('B')) await db.exec(sql) // every agency has its own 001
    for (const sql of firstDocs('A')) {
      await expect(db.exec(sql), 'ONE agency still cannot hold a number twice — the retry in document-numbering.ts depends on it').rejects.toThrow(/duplicate key/)
    }
    await db.exec(m375) // and again: nothing left to do, nothing breaks

    // It REFUSES rather than leave a number with no uniqueness at all.
    await db.exec('DELETE FROM expenses; ALTER TABLE expenses DROP CONSTRAINT expenses_tenant_id_expense_number_key')
    await db.exec('ALTER TABLE expenses ADD CONSTRAINT expenses_expense_number_key UNIQUE (expense_number)')
    await expect(db.exec(m375)).rejects.toThrow(/refusing to drop expenses_expense_number_key/)
    await db.exec('ROLLBACK').catch(() => undefined)
    expect(await hasConstraint('expenses_expense_number_key'), 'the refusal dropped nothing').toBe(true)
    // Put the fresh build back as it was, for the checks below.
    await db.exec(`ALTER TABLE expenses DROP CONSTRAINT expenses_expense_number_key;
                   ALTER TABLE expenses ADD CONSTRAINT expenses_tenant_id_expense_number_key UNIQUE (tenant_id, expense_number)`)

    // "A no-op on production" is the same claim as "a no-op the second time":
    // in both cases everything is already where 374 puts it.
    const fingerprint = async () => JSON.stringify((await db.query(`
      SELECT c.table_name, c.column_name, c.udt_name, c.is_nullable, c.column_default
        FROM information_schema.columns c WHERE c.table_schema = 'public' ORDER BY 1, 2`)).rows) +
      JSON.stringify((await db.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1")).rows)
    const before374Again = await fingerprint()
    await db.exec(readFileSync(path.join(MIGRATIONS_DIR, '374_adopt_live_schema.sql'), 'utf8'))
    expect(await fingerprint(), '374 changes nothing where its work is already done').toBe(before374Again)

    // Migration 361: a SECURITY DEFINER function runs past RLS, so one that
    // takes a caller-supplied id must not be executable by the browser roles.
    // Production proved anon could call ten of them (cross-tenant reads and
    // writes). New ones fail here unless revoked, or listed below with the
    // reason the function is safe to expose (it derives the tenant itself).
    const SAFE_FOR_BROWSER_ROLES: Record<string, string> = {
      user_has_role: 'checks auth.uid() against get_user_tenant_id(); argument is a role name, not an id',
      reset_tenant_vocabulary: 'scopes to get_user_tenant_id(); argument is a vocabulary kind',
    }
    const exposed = await db.query(`
      SELECT DISTINCT p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authd
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
         AND pg_get_function_result(p.oid) <> 'trigger'
         AND pg_get_function_identity_arguments(p.oid) <> ''
    `)
    const leaks = (exposed.rows as Array<{ proname: string; anon: boolean; authd: boolean }>)
      .filter(r => (r.anon || r.authd) && !SAFE_FOR_BROWSER_ROLES[r.proname])
      .map(r => `${r.proname} (anon=${r.anon}, authenticated=${r.authd})`)
    expect(
      leaks,
      'SECURITY DEFINER functions with arguments that anon/authenticated can EXECUTE — ' +
        'REVOKE them (see migration 361) or justify them in SAFE_FOR_BROWSER_ROLES:\n  ' +
        leaks.join('\n  ')
    ).toEqual([])

    // Migration 383: a WhatsApp message keeps its conversation's counters —
    // inbound raises unread, every message moves last_message_at forward and
    // counts, and an older message arriving late never moves it back.
    const tenant = (await db.query(
      "SELECT id FROM tenants WHERE company_name = 'Replay Probe Co'"
    )).rows[0] as { id: string }
    const conv = (await db.query(
      `INSERT INTO whatsapp_conversations (tenant_id, phone_number, status)
       VALUES ($1, '+200000000383', 'active') RETURNING id`,
      [tenant.id]
    )).rows[0] as { id: string }
    const msg = (direction: string, at: string) => db.query(
      `INSERT INTO whatsapp_messages (tenant_id, conversation_id, direction, message_body, sent_at)
       VALUES ($1, $2, $3, 'hi', $4)`,
      [tenant.id, conv.id, direction, at]
    )
    await msg('inbound', '2026-09-24T10:00:00Z')
    await msg('inbound', '2026-09-24T10:05:00Z')
    await msg('outbound', '2026-09-24T10:06:00Z')
    await msg('inbound', '2026-09-24T09:00:00Z') // late delivery of an older one
    const counters = (await db.query(
      'SELECT unread_count, message_count, last_message_at FROM whatsapp_conversations WHERE id = $1',
      [conv.id]
    )).rows[0] as { unread_count: number; message_count: number; last_message_at: Date }
    expect(counters.unread_count).toBe(3)
    expect(counters.message_count).toBe(4)
    expect(new Date(counters.last_message_at).toISOString()).toBe('2026-09-24T10:06:00.000Z')

    // Migration 384: a notification can go to a login, once per dedupe_key —
    // the second of two racing inserts (two tabs) is ignored, not doubled —
    // and a row must name SOMEONE.
    const login = (await db.query(
      "INSERT INTO auth.users (email) VALUES ('probe-384@example.com') RETURNING id"
    )).rows[0] as { id: string }
    const fileOnce = () => db.query(
      `INSERT INTO notifications (user_id, dedupe_key, type, title)
       VALUES ($1, 'gmail:abc', 'new_email', 'New email from Probe')
       ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
      [login.id]
    )
    await fileOnce()
    await fileOnce()
    const filed = (await db.query(
      'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1', [login.id]
    )).rows[0] as { n: number }
    expect(filed.n).toBe(1)
    await expect(
      db.query("INSERT INTO notifications (type, title) VALUES ('x', 'nobody')")
    ).rejects.toThrow(/notifications_has_recipient/)
  }, 120_000)
})
