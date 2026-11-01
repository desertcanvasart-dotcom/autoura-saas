import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneTail } from '@/lib/supplier-accounts'
import { recordsForPhone } from '@/lib/supplier-claims'

// Migration 458 + its readers (audit SN-4, SN-10, SN-11): sign-in matches a
// phone by a stored, indexed tail; the network search filters in the
// database; the client-day job reads tomorrow's lines in pages.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const mig = read('supabase/migrations/458_supplier_network_lookups.sql')

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table suppliers(id serial primary key, whatsapp text, phone text, contact_phone text);
    create table booking_supplier_status(id uuid primary key default gen_random_uuid(), tenant_id uuid, supplier_id uuid, service_date date);
    create table supplier_network_profiles(account_id serial primary key, kinds text[] not null default '{}', cities text[] not null default '{}', languages text[] not null default '{}');
  `)
  await db.exec(mig)
})

describe('migration 458 on a real Postgres', () => {
  it('stores the last 9 digits of each number, however it was typed', async () => {
    await db.exec(`insert into suppliers(whatsapp, phone, contact_phone) values
      ('+20 111-240 5969', '01112405969', null), ('', '12345', '(010) 9999 0001')`)
    const { rows } = await db.query<{ phone_tails: string[] }>('select phone_tails from suppliers order by id')
    expect(rows[0].phone_tails).toEqual(['112405969', '112405969'])
    // Too short or empty = no tail (never a false match).
    expect(rows[1].phone_tails).toEqual(['099990001'])
  })

  it('the tail is the one sign-in looks for', async () => {
    const { rows } = await db.query<{ id: number }>(`select id from suppliers where phone_tails @> array[$1]`, [phoneTail('201112405969')])
    expect(rows.map(r => r.id)).toEqual([1])
  })

  it('network cities and languages match case-insensitively', async () => {
    await db.exec(`insert into supplier_network_profiles(kinds, cities, languages) values ('{transport_company}', '{" Cairo ", Giza}', '{English}')`)
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from supplier_network_profiles
      where kinds @> '{transport_company}' and search_cities @> '{cairo}' and search_languages @> '{english}'`)
    expect(rows[0].n).toBe(1)
  })

  it('indexes the lookups', () => {
    for (const ix of ['idx_suppliers_phone_tails', 'idx_booking_supplier_status_tenant_supplier', 'idx_booking_supplier_status_service_date',
      'idx_supplier_network_profiles_kinds', 'idx_supplier_network_profiles_search_cities', 'idx_supplier_network_profiles_search_languages']) {
      expect(mig).toContain(ix)
    }
  })
})

/** A fake query builder that records the filters it was given. */
function fakeDb(rows: Record<string, unknown>[], calls: string[]): SupabaseClient {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => { calls.push(`${table}.${name}:${JSON.stringify(args)}`); return b }
    for (const m of ['select', 'contains', 'or', 'in', 'eq']) b[m] = chain(m)
    b.limit = (...args: unknown[]) => { calls.push(`${table}.limit:${JSON.stringify(args)}`); return Promise.resolve({ data: table === 'suppliers' ? rows : [], error: null }) }
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
    return b
  }
  return { from: builder } as unknown as SupabaseClient
}

describe('sign-in lookup (SN-4)', () => {
  it('matches a full number by the stored tail, not a wildcard search', async () => {
    const calls: string[] = []
    await recordsForPhone(fakeDb([], calls), '201112405969')
    expect(calls).toContain('suppliers.contains:["phone_tails",["112405969"]]')
    expect(calls.some(c => c.startsWith('suppliers.or'))).toBe(false)
  })

  it('a number shorter than 9 digits keeps the loose search', async () => {
    const calls: string[] = []
    await recordsForPhone(fakeDb([], calls), '12345678')
    expect(calls.some(c => c.startsWith('suppliers.or'))).toBe(true)
  })

  it('a failed lookup is an error, not "no supplier"', async () => {
    const db = { from: () => ({ select: () => ({ contains: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) } as unknown as SupabaseClient
    await expect(recordsForPhone(db, '201112405969')).rejects.toThrow(/boom/)
  })
})

describe('readers use the new columns', () => {
  it('network search filters kind, city and language in the database', () => {
    const src = read('app/api/network-suppliers/route.ts')
    expect(src).toContain(".contains('kinds'")
    expect(src).toContain(".contains('search_cities'")
    expect(src).toContain(".contains('search_languages'")
  })

  it('the search box waits for a pause before fetching', () => {
    expect(read('app/suppliers/_views/NetworkSuppliersView.tsx')).toMatch(/setTimeout\(\(\) => \{ void search\(\) \}, 300\)/)
  })

  it("the client-day job reads tomorrow's lines in pages", () => {
    expect(read('app/api/cron/client-day-reminders/route.ts')).toMatch(/fetchAllPages[\s\S]*\.range\(from, to\)/)
  })
})
