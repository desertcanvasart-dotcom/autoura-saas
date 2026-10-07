// A dropped column must not be NAMED anywhere the app talks to the database.
//
// Migration 371 drops tour_templates.uses_day_builder. PostgREST fails a whole
// query on a column that does not exist — /api/b2b/calculate-price named this
// one in an embedded select, so dropping it first would have taken the B2B
// calculator down. The code goes first, then the migration; this keeps it that
// way, and is where the next dropped column gets added.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/** column → the migration that drops it. */
const DROPPED: Record<string, string> = {
  uses_day_builder: '371_drop_uses_day_builder.sql',
  // Its twin. NOT `pricing_model`, which is a live column on b2b partners —
  // the match below is on the whole word.
  pricing_mode: '372_drop_pricing_mode.sql',
  // The sibling's again. (376 also drops content_library.content_type, which
  // cannot be listed: `content_type` is an everyday word — uploads, e-mail
  // attachments — and this match is by name alone. The generated types cover
  // it: naming it on content_library no longer compiles.)
  cabin_allocation: '376_drop_stray_columns.sql',
}
// Not listed: bookings.status_override. 373 dropped the sibling's pasted-in
// column; 389 brings it back as this repo's own (the booking status control).

const ROOTS = ['app', 'lib', 'components', 'hooks', 'scripts']
const SKIP = /(^|\/)(node_modules|\.next|__tests__|__mocks__)(\/|$)|database\.types\.ts$|\.test\.tsx?$/

function sources(dir: string, out: string[] = []): string[] {
  let entries: string[] = []
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    const p = join(dir, name)
    if (SKIP.test(p)) continue
    const st = statSync(p)
    if (st.isDirectory()) sources(p, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p)
  }
  return out
}

/** The code, without comments — a comment may say what a column USED to do. */
const code = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:"'`])\/\/.*$/gm, '$1')

describe('dropped columns', () => {
  const files = ROOTS.flatMap(r => sources(join(process.cwd(), r)))

  it('scans the app', () => {
    expect(files.length).toBeGreaterThan(500)
  })

  it.each(Object.entries(DROPPED))('%s is named nowhere in code (dropped by %s)', (column) => {
    const hits = files.filter(f => new RegExp(`\\b${column}\\b`).test(code(readFileSync(f, 'utf8'))))
    expect(hits.map(f => f.replace(process.cwd() + '/', '')), `these still name "${column}" — a query naming a dropped column fails outright`).toEqual([])
  })

  it.each(Object.entries(DROPPED))('%s: the migration that drops it exists and is idempotent', (column, migration) => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', migration), 'utf8')
    expect(sql).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${column}\\b`))
  })
})
