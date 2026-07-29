#!/usr/bin/env node
/**
 * generate-db-types.mjs — regenerate types/database.types.ts from the LIVE
 * production schema.
 *
 * Why this exists: the hand-written interfaces in types/ drifted from the real
 * schema for months, and that drift class has caused real incidents — code
 * INSERTing columns that don't exist (payments sat at 0 rows because every
 * insert 400'd, migration 257) and code referencing columns a migration
 * dropped (signup broken for every new tenant, migration 262). Generated
 * types turn that class of bug into a compile error.
 *
 * Why not `supabase gen types`: the CLI needs a linked project or a direct
 * Postgres URL, and neither is available in this environment (the project is
 * not linked and only the API keys are configured). PostgREST already exposes
 * the schema — types, NOT NULL, defaults, enums — as an OpenAPI document at
 * GET {SUPABASE_URL}/rest/v1/, readable with the service-role key we do have.
 * If the project is ever linked, `supabase gen types typescript --linked`
 * can replace this script; the output shape is compatible.
 *
 * Usage:
 *   node scripts/generate-db-types.mjs            # rewrite types/database.types.ts
 *   node scripts/generate-db-types.mjs --check    # exit 1 if committed file drifted
 *
 * The generated file reflects PRODUCTION, not supabase/migrations/. That is
 * deliberate: migrations are applied by hand, and production is the schema
 * the app actually runs against. Run this after applying a migration.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

const ROOT = path.join(import.meta.dirname, '..')
const OUT_FILE = path.join(ROOT, 'types', 'database.types.ts')

dotenv.config({ path: path.join(ROOT, '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const checkMode = process.argv.includes('--check')

/** Map a PostgREST OpenAPI property to a TypeScript type. */
function tsType(prop) {
  // Postgres enums arrive as an explicit value list — emit a literal union.
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    return prop.enum.map((v) => JSON.stringify(v)).join(' | ')
  }
  const format = prop.format || ''
  if (format === 'json' || format === 'jsonb') return 'Json'
  if (prop.type === 'array') {
    const items = prop.items ? tsType(prop.items) : 'unknown'
    return items.includes(' ') ? `(${items})[]` : `${items}[]`
  }
  switch (prop.type) {
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'string':
      return 'string'
    default:
      return 'unknown'
  }
}

function buildTable(name, def) {
  const required = new Set(def.required || [])
  const rows = []
  const inserts = []
  const updates = []
  const relationships = []
  for (const [col, prop] of Object.entries(def.properties || {})) {
    // PostgREST embeds FK metadata in the column description, e.g.
    // "This is a Foreign Key to `tenants.id`.<fk table='tenants' column='id'/>".
    // Emitting it as Relationships is what lets embedded selects like
    // select('*, client:clients(*)') resolve to real row types.
    const fk = /<fk table='([^']+)' column='([^']+)'\/>/.exec(prop.description || '')
    if (fk) {
      relationships.push(
        [
          `          {`,
          `            foreignKeyName: "${name}_${col}_fkey"`,
          `            columns: ["${col}"]`,
          `            isOneToOne: false`,
          `            referencedRelation: "${fk[1]}"`,
          `            referencedColumns: ["${fk[2]}"]`,
          `          },`,
        ].join('\n')
      )
    }
    const base = tsType(prop)
    const notNull = required.has(col)
    const hasDefault = prop.default !== undefined
    const rowType = notNull ? base : `${base} | null`
    rows.push(`          ${col}: ${rowType}`)
    // Insert: a column is omittable when it's nullable or has a DB default.
    const insertOptional = !notNull || hasDefault
    inserts.push(`          ${col}${insertOptional ? '?' : ''}: ${rowType}`)
    updates.push(`          ${col}?: ${rowType}`)
  }
  return { rows, inserts, updates, relationships }
}

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  })
  if (!res.ok) {
    console.error(`Schema fetch failed: ${res.status} ${res.statusText}`)
    process.exit(1)
  }
  const spec = await res.json()
  const defs = spec.definitions
  if (!defs || Object.keys(defs).length === 0) {
    // Never write an empty Database type on a bad response — a hollow file
    // would type-check everything as never and read as "no tables".
    console.error('Schema fetch returned no table definitions; refusing to write.')
    process.exit(1)
  }

  const tableNames = Object.keys(defs).sort()
  const blocks = tableNames.map((name) => {
    const { rows, inserts, updates, relationships } = buildTable(name, defs[name])
    const rels =
      relationships.length > 0
        ? `        Relationships: [\n${relationships.join('\n')}\n        ]`
        : `        Relationships: []`
    return [
      `      ${name}: {`,
      `        Row: {`,
      rows.join('\n'),
      `        }`,
      `        Insert: {`,
      inserts.join('\n'),
      `        }`,
      `        Update: {`,
      updates.join('\n'),
      `        }`,
      rels,
      `      }`,
    ].join('\n')
  })

  const output = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with: npm run types:generate
 * Drift check:     npm run types:check
 *
 * Source: live production schema via PostgREST OpenAPI
 * (see scripts/generate-db-types.mjs for why not \`supabase gen types\`).
 * Tables: ${tableNames.length}
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
${blocks.join('\n')}
    }
    // NOTE: must be \`{ [_ in never]: never }\`, NOT \`Record<string, never>\`.
    // Record's string index signature makes \`keyof Functions\` = string, which
    // postgrest-js reads as "every column is a computed field" — collapsing
    // every select('*') result to {}.
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
`

  if (checkMode) {
    const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : ''
    if (current !== output) {
      console.error(
        'types/database.types.ts is out of date with the production schema.\n' +
          'Run: npm run types:generate'
      )
      process.exit(1)
    }
    console.log(`types/database.types.ts matches production (${tableNames.length} tables).`)
    return
  }

  writeFileSync(OUT_FILE, output)
  console.log(`Wrote types/database.types.ts (${tableNames.length} tables).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
