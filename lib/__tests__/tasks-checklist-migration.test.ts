import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// Migration 392 on a real Postgres: the three columns the task generator
// writes, added without touching existing rows, and safe to run twice.

let db: PGlite
const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/392_tasks_checklist.sql'), 'utf8')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table tasks(
      id uuid primary key default gen_random_uuid(), tenant_id uuid not null, title text not null,
      status varchar(20) default 'todo', linked_type varchar(50), linked_id uuid);
    insert into tasks(tenant_id, title) values ('00000000-0000-0000-0000-00000000000a', 'By hand');`)
}, 60_000) // booting PGlite under a full parallel run can exceed the 10 s default

describe('392_tasks_checklist', () => {
  it('adds service_type, generation_snapshot and checklist, and replays cleanly', async () => {
    await db.exec(mig)
    await db.exec(mig)
    const cols = await db.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type from information_schema.columns
        where table_name = 'tasks' and column_name in ('service_type', 'generation_snapshot', 'checklist')
        order by column_name`)
    expect(cols.rows).toEqual([
      { column_name: 'checklist', data_type: 'jsonb' },
      { column_name: 'generation_snapshot', data_type: 'jsonb' },
      { column_name: 'service_type', data_type: 'text' },
    ])
    const existing = await db.query<Record<string, unknown>>(`select title, service_type, checklist from tasks`)
    expect(existing.rows).toEqual([{ title: 'By hand', service_type: null, checklist: null }])
    const idx = await db.query(`select 1 from pg_indexes where indexname = 'idx_tasks_linked_service_type'`)
    expect(idx.rows).toHaveLength(1)
  })
})
