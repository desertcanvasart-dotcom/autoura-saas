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
    // …and a tour can still be created without it.
    await db.exec(`
      INSERT INTO tour_templates (tenant_id, template_code, template_name, tour_type, duration_days)
      SELECT t.id, 'PROBE-371', 'After the flag', 'day_tour', 1 FROM tenants t WHERE t.company_name = 'Replay Probe Co'`)
    const made = await db.query(`SELECT count(*)::int AS n FROM tour_templates WHERE template_code = 'PROBE-371'`)
    expect((made.rows[0] as { n: number }).n).toBe(1)

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
  }, 120_000)
})
