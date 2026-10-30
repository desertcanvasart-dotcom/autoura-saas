import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Who may write, enforced by the database (migrations 424, 425)
// ============================================
// The browser holds the user's own Supabase session, so a hidden button or an
// API check is not the lock: these run the real migrations in Postgres and
// write as a signed-in viewer, member, admin and owner, straight through RLS.

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')

// auth.uid() reads a setting, so each probe can act as a different person.
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

let db: PGlite
let tenant: string
const people: Record<'owner' | 'admin' | 'manager' | 'member' | 'viewer', string> = {} as never

/** Run `sql` as a signed-in user, through RLS; resolves to the error text or null. */
async function as(userId: string, sql: string): Promise<string | null> {
  try {
    await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('test.uid', '${userId}', true); ${sql}; COMMIT;`)
    return null
  } catch (e) {
    await db.exec('ROLLBACK').catch(() => undefined)
    return String((e as Error).message)
  }
}

async function count(sql: string): Promise<number> {
  const r = await db.query(sql)
  return Number((r.rows[0] as { n: number }).n)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  for (const file of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
    } catch {
      // The replay test owns "every migration applies"; a handful need real
      // Supabase features and are exempt there.
      await db.exec('ROLLBACK').catch(() => undefined)
    }
  }
  // Supabase grants the API roles table access; RLS is what narrows it.
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `)

  tenant = ((await db.query(
    "INSERT INTO tenants (company_name, contact_email) VALUES ('Roles Co', 'roles@example.com') RETURNING id"
  )).rows[0] as { id: string }).id

  for (const role of ['owner', 'admin', 'manager', 'member', 'viewer'] as const) {
    const id = ((await db.query(
      `INSERT INTO auth.users (email) VALUES ('${role}@roles.test') RETURNING id`
    )).rows[0] as { id: string }).id
    people[role] = id
    // Sign-up gave each their own company; put them in Roles Co instead.
    await db.exec(`
      DELETE FROM tenant_members WHERE user_id = '${id}';
      INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
        VALUES ('${tenant}', '${id}', '${role}', 'active', NOW());
      UPDATE user_profiles SET active_tenant_id = '${tenant}' WHERE id = '${id}';
    `)
  }
  await db.exec(`INSERT INTO clients (tenant_id, full_name) VALUES ('${tenant}', 'Existing Client')`)
}, 120_000)

describe('424: viewers read; they do not write', () => {
  it('a viewer cannot add, edit or delete a client', async () => {
    expect(await as(people.viewer, `INSERT INTO clients (tenant_id, full_name) VALUES ('${tenant}', 'By Viewer')`))
      .toMatch(/row-level security/)
    await as(people.viewer, `UPDATE clients SET full_name = 'Renamed' WHERE full_name = 'Existing Client'`)
    await as(people.viewer, `DELETE FROM clients WHERE full_name = 'Existing Client'`)
    expect(await count(`SELECT count(*) AS n FROM clients WHERE full_name = 'Existing Client'`)).toBe(1)
  })

  it('a viewer can still read', async () => {
    const r = await db.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('test.uid', '${people.viewer}', true);`)
      return tx.query(`SELECT count(*) AS n FROM clients WHERE tenant_id = '${tenant}'`)
    })
    expect(Number((r.rows[0] as { n: number }).n)).toBeGreaterThan(0)
  })

  it('a member still writes as before', async () => {
    expect(await as(people.member, `INSERT INTO clients (tenant_id, full_name) VALUES ('${tenant}', 'By Member')`)).toBeNull()
    expect(await as(people.member, `UPDATE clients SET notes = 'edited' WHERE full_name = 'By Member'`)).toBeNull()
    expect(await count(`SELECT count(*) AS n FROM clients WHERE full_name = 'By Member' AND notes = 'edited'`)).toBe(1)
  })

  it('covers the money and passport tables', async () => {
    const r = await db.query(`
      SELECT tablename FROM pg_policies
       WHERE policyname = 'Viewers cannot insert' AND permissive = 'RESTRICTIVE'`)
    const names = (r.rows as Array<{ tablename: string }>).map(x => x.tablename)
    for (const t of ['invoices', 'payments', 'invoice_payments', 'supplier_invoices', 'expenses', 'clients',
      'itineraries', 'bookings', 'booking_passenger_documents', 'quote_versions']) {
      expect(names, t).toContain(t)
    }
    // A viewer's own mailbox and sign-in records stay theirs to write.
    for (const t of ['gmail_tokens', 'email_rules', 'push_subscriptions', 'tenant_members']) {
      expect(names, t).not.toContain(t)
    }
  })
})

describe('425: the team role rules hold in the database', () => {
  const memberRow = (role: string) => `user_id = '${people[role as keyof typeof people]}' AND tenant_id = '${tenant}'`

  it('an admin cannot make themselves owner', async () => {
    expect(await as(people.admin, `UPDATE tenant_members SET role = 'owner' WHERE ${memberRow('admin')}`))
      .toMatch(/own role/)
  })

  it('an admin cannot demote or remove the owner', async () => {
    expect(await as(people.admin, `UPDATE tenant_members SET role = 'viewer' WHERE ${memberRow('owner')}`))
      .toMatch(/owner/)
    expect(await as(people.admin, `DELETE FROM tenant_members WHERE ${memberRow('owner')}`))
      .toMatch(/owner/)
    expect(await count(`SELECT count(*) AS n FROM tenant_members WHERE ${memberRow('owner')} AND role = 'owner'`)).toBe(1)
  })

  it('an admin cannot promote someone else to owner', async () => {
    expect(await as(people.admin, `UPDATE tenant_members SET role = 'owner' WHERE ${memberRow('member')}`))
      .toMatch(/owner/)
  })

  it('nobody signed in adds a membership directly', async () => {
    const outsider = ((await db.query(`INSERT INTO auth.users (email) VALUES ('out@roles.test') RETURNING id`)).rows[0] as { id: string }).id
    expect(await as(people.owner, `INSERT INTO tenant_members (tenant_id, user_id, role, status) VALUES ('${tenant}', '${outsider}', 'admin', 'active')`))
      .not.toBeNull()
  })

  it('an admin still changes an ordinary role, and an owner still manages owners', async () => {
    expect(await as(people.admin, `UPDATE tenant_members SET role = 'manager' WHERE ${memberRow('member')}`)).toBeNull()
    expect(await count(`SELECT count(*) AS n FROM tenant_members WHERE ${memberRow('member')} AND role = 'manager'`)).toBe(1)
    expect(await as(people.owner, `UPDATE tenant_members SET role = 'owner' WHERE ${memberRow('admin')}`)).toBeNull()
  })

  it('an invitation offers only roles below the inviter', async () => {
    const invite = (role: string) => `INSERT INTO tenant_invitations (tenant_id, email, role, invited_by, invitation_token, expires_at)
      VALUES ('${tenant}', '${role}-${Math.random()}@x.test', '${role}', '${people.manager}', '${Math.random()}', NOW() + interval '7 days')`
    expect(await as(people.manager, invite('owner'))).toMatch(/below your own|row-level security/)
    expect(await as(people.manager, invite('manager'))).toMatch(/below your own|row-level security/)
  })
})

describe('446: a service booking\'s history is append-only', () => {
  let line: string
  let booking: string

  beforeAll(async () => {
    booking = ((await db.query(`
      INSERT INTO bookings (tenant_id, booking_number, trip_name, start_date, end_date,
                            total_days, num_travelers, total_amount, balance_due, status)
      VALUES ('${tenant}', 'BK-446', 'Trip', DATE '2027-01-01', DATE '2027-01-05', 5, 2, 1000, 1000, 'pending_deposit')
      RETURNING id`)).rows[0] as { id: string }).id
    line = ((await db.query(`
      INSERT INTO booking_supplier_status (tenant_id, booking_id, supplier_type, supplier_name, status)
      VALUES ('${tenant}', '${booking}', 'transport', 'Nile Cars', 'pending') RETURNING id`)).rows[0] as { id: string }).id
  })

  const event = (to: string) => `INSERT INTO service_booking_events
    (tenant_id, booking_id, service_booking_id, actor_kind, channel, from_status, to_status)
    VALUES ('${tenant}', '${booking}', '${line}', 'operator', 'app', 'pending', '${to}')`

  it('the team adds events; a viewer cannot', async () => {
    expect(await as(people.owner, event('requested'))).toBeNull()
    expect(await as(people.viewer, event('accepted'))).toMatch(/row-level security/)
    expect(await count(`SELECT count(*) AS n FROM service_booking_events WHERE service_booking_id = '${line}'`)).toBe(1)
  })

  it('nobody edits an event — not even the service role — and a signed-in user cannot delete one', async () => {
    await expect(db.exec(`UPDATE service_booking_events SET to_status = 'done' WHERE service_booking_id = '${line}'`))
      .rejects.toThrow(/append-only/)
    await as(people.owner, `DELETE FROM service_booking_events WHERE service_booking_id = '${line}'`)
    expect(await count(`SELECT count(*) AS n FROM service_booking_events WHERE service_booking_id = '${line}'`)).toBe(1)
  })

  it('takes the new states; an old word is saved as its new state (447); nothing else', async () => {
    for (const s of ['requested', 'accepted', 'assigned', 'done', 'declined', 'expired']) {
      expect(await as(people.owner, `UPDATE booking_supplier_status SET status = '${s}' WHERE id = '${line}'`), s).toBeNull()
    }
    for (const [said, saved] of [['contacted', 'requested'], ['confirmed', 'accepted'], ['no_response', 'expired']]) {
      expect(await as(people.owner, `UPDATE booking_supplier_status SET status = '${said}' WHERE id = '${line}'`), said).toBeNull()
      expect(await count(`SELECT count(*) AS n FROM booking_supplier_status WHERE id = '${line}' AND status = '${saved}'`), said).toBe(1)
    }
    expect(await as(people.owner, `UPDATE booking_supplier_status SET status = 'maybe' WHERE id = '${line}'`)).toMatch(/check constraint/)
    expect(await as(people.owner, `UPDATE booking_supplier_status SET resource_kind = 'friend' WHERE id = '${line}'`)).toMatch(/check constraint/)
  })

  it('the events go with their line', async () => {
    await db.exec(`DELETE FROM booking_supplier_status WHERE id = '${line}'`)
    expect(await count(`SELECT count(*) AS n FROM service_booking_events WHERE service_booking_id = '${line}'`)).toBe(0)
  })
})

describe('448: a supplier reply link', () => {
  let line: string
  let booking: string

  beforeAll(async () => {
    booking = ((await db.query(`
      INSERT INTO bookings (tenant_id, booking_number, trip_name, start_date, end_date,
                            total_days, num_travelers, total_amount, balance_due, status)
      VALUES ('${tenant}', 'BK-448', 'Trip', DATE '2027-01-01', DATE '2027-01-05', 5, 2, 1000, 1000, 'pending_deposit')
      RETURNING id`)).rows[0] as { id: string }).id
    line = ((await db.query(`
      INSERT INTO booking_supplier_status (tenant_id, booking_id, supplier_type, supplier_name, status)
      VALUES ('${tenant}', '${booking}', 'transport', 'Cairo Cars', 'pending') RETURNING id`)).rows[0] as { id: string }).id
  })

  const link = (token: string) => `INSERT INTO service_booking_links (tenant_id, booking_id, service_booking_id, token)
    VALUES ('${tenant}', '${booking}', '${line}', '${token}')`

  it('the team makes one; a viewer cannot', async () => {
    expect(await as(people.viewer, link('tok-viewer'))).toMatch(/row-level security/)
    expect(await as(people.owner, link('tok-1'))).toBeNull()
  })

  it('one active link per line; a revoked one frees the slot', async () => {
    expect(await as(people.owner, link('tok-2'))).toMatch(/unique|duplicate/)
    expect(await as(people.owner, `UPDATE service_booking_links SET revoked_at = NOW() WHERE token = 'tok-1'`)).toBeNull()
    expect(await as(people.owner, link('tok-2'))).toBeNull()
  })

  it('goes with its line', async () => {
    await db.exec(`DELETE FROM booking_supplier_status WHERE id = '${line}'`)
    expect(await count(`SELECT count(*) AS n FROM service_booking_links WHERE service_booking_id = '${line}'`)).toBe(0)
  })
})

describe('449: a supplier\'s own page and their days off', () => {
  let supplier: string

  beforeAll(async () => {
    supplier = ((await db.query(`
      INSERT INTO suppliers (tenant_id, name) VALUES ('${tenant}', 'Giza Cars') RETURNING id`)).rows[0] as { id: string }).id
  })

  const link = (token: string) => `INSERT INTO supplier_portal_links (tenant_id, supplier_id, token) VALUES ('${tenant}', '${supplier}', '${token}')`
  const off = (day: string, by = 'supplier') => `INSERT INTO supplier_unavailable_days (tenant_id, supplier_id, day, marked_by) VALUES ('${tenant}', '${supplier}', DATE '${day}', '${by}')`

  it('the team makes the link; a viewer cannot; one active link per supplier', async () => {
    expect(await as(people.viewer, link('p-viewer'))).toMatch(/row-level security/)
    expect(await as(people.owner, link('p-1'))).toBeNull()
    expect(await as(people.owner, link('p-2'))).toMatch(/unique|duplicate/)
    expect(await as(people.owner, `UPDATE supplier_portal_links SET revoked_at = NOW() WHERE token = 'p-1'`)).toBeNull()
    expect(await as(people.owner, link('p-2'))).toBeNull()
  })

  it('a day off once per day; only supplier or office marks it; a viewer cannot', async () => {
    expect(await as(people.owner, off('2027-02-01'))).toBeNull()
    expect(await as(people.owner, off('2027-02-01', 'office'))).toMatch(/unique|duplicate/)
    expect(await as(people.owner, off('2027-02-02', 'someone'))).toMatch(/check constraint/)
    expect(await as(people.viewer, off('2027-02-03'))).toMatch(/row-level security/)
  })

  it('both go with their supplier', async () => {
    await db.exec(`DELETE FROM suppliers WHERE id = '${supplier}'`)
    expect(await count(`SELECT count(*) AS n FROM supplier_portal_links WHERE supplier_id = '${supplier}'`)).toBe(0)
    expect(await count(`SELECT count(*) AS n FROM supplier_unavailable_days WHERE supplier_id = '${supplier}'`)).toBe(0)
  })
})
