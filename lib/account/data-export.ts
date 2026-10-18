// ============================================
// Data export: a company's data, or one person's, as a downloadable zip
// ============================================
// The Terms (6.3) promise a company can export its data at any time, and for
// 30 days after closing; the privacy policy promises each person a portable
// copy of their own. Both come out as a zip of one CSV and one JSON file per
// table, with a README saying what is in it.
//
// The company export follows the schema (tenant_data_tables, migration 433):
// every table with a tenant_id, every column — so a table added next month is
// exported without anyone remembering to list it. What is left out is listed
// here, and why:
//   - secrets: Gmail OAuth tokens, and the bearer tokens in share and portal
//     links (a copy of the export would otherwise be a key to the live data);
//   - bookkeeping that is ours, not theirs (rate-limit and send-claim rows).

import { fetchAllPages } from '@/lib/db/fetch-all-pages'

/** Tables never exported. */
export const EXCLUDED_TABLES = new Set([
  'gmail_tokens',
  'email_send_claims',
  'rate_limit_buckets',
])

/** Columns that are credentials: dropped from every table they appear in. */
export const SECRET_COLUMNS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'invitation_token',
])

/** Rows of a company that carry no tenant_id, reached through their parent. */
const CHILD_TABLES: Array<{ table: string; key: string; parent: string }> = [
  { table: 'content_variations', key: 'content_id', parent: 'content_library' },
  { table: 'conversation_activity', key: 'conversation_id', parent: 'email_conversations' },
  { table: 'email_client_links', key: 'client_id', parent: 'clients' },
]

/** A person's own rows, outside any one company. */
const PERSONAL_TABLES: Array<{ table: string; key: string }> = [
  { table: 'user_profiles', key: 'id' },
  { table: 'user_preferences', key: 'user_id' },
  { table: 'user_settings', key: 'user_id' },
  { table: 'email_signatures', key: 'user_id' },
  { table: 'copilot_settings', key: 'user_id' },
  { table: 'notifications', key: 'user_id' },
  { table: 'user_activity_daily', key: 'user_id' },
  { table: 'tenant_members', key: 'user_id' },
]

type Row = Record<string, unknown>
type Page = PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
type Filter = {
  eq: (c: string, v: string) => Filter
  in: (c: string, v: string[]) => Filter
  order: (c: string) => Ordered
}
/** The admin client, loosely: tables are named at run time here. */
type Ordered = { order: (c: string) => Ordered; range: (a: number, b: number) => Page }
type TableInfo = { table_name: string; column_names: string[]; key_columns?: string[] | null }
type Db = {
  from: (table: string) => unknown
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

const query = (db: Db, table: string, columns: string[]) =>
  (db.from(table) as { select: (c: string) => Filter }).select(columns.join(','))

/** Search vectors: derived from the text beside them, and large. */
const DERIVED_COLUMNS = new Set(['embedding'])

const exportable = (columns: string[]) => columns.filter(c => !SECRET_COLUMNS.has(c) && !DERIVED_COLUMNS.has(c))

/** Pages on the primary key where there is one, so no row falls between pages. */
const orderColumns = (info: TableInfo): string[] =>
  info.key_columns?.length ? info.key_columns
    : info.column_names.includes('id') ? ['id']
    : exportable(info.column_names)

async function readAll(
  db: Db,
  info: TableInfo,
  filter: (q: Filter) => Filter,
): Promise<Row[]> {
  const cols = exportable(info.column_names)
  const keys = orderColumns(info)
  const { data, error } = await fetchAllPages<Row, { message: string }>((from, to) => {
    // Every primary-key column, so the order is total and no row falls
    // between two pages (a table keyed (tenant_id, user_id, day) ordered on
    // tenant_id alone is in no particular order inside one company).
    let q = filter(query(db, info.table_name, cols)).order(keys[0])
    for (const k of keys.slice(1)) q = q.order(k)
    return q.range(from, to)
  })
  if (error) throw new Error(`${info.table_name}: ${error.message}`)
  return data
}

async function columnsOf(db: Db, tables: string[]): Promise<Map<string, TableInfo>> {
  const { data, error } = await db.rpc('data_table_columns', { p_tables: tables })
  if (error) throw new Error(`Reading the table list failed: ${error.message}`)
  const rows = (data ?? []) as TableInfo[]
  return new Map(rows.map(r => [r.table_name, r]))
}

/** One CSV cell: objects as JSON, and every cell quoted when it needs to be.
 *  Text starting = + - @ is prefixed with ' so a spreadsheet does not run it;
 *  numbers are left alone (a refund of -150 must stay a number). */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return ''
  const columns = Object.keys(rows[0])
  const lines = [columns.map(csvCell).join(',')]
  for (const row of rows) lines.push(columns.map(c => csvCell(row[c])).join(','))
  return lines.join('\r\n') + '\r\n'
}

export type ExportTables = Map<string, Row[]>

/** Every row a company owns, table by table. */
export async function collectCompanyData(client: object, tenantId: string): Promise<ExportTables> {
  const db = client as Db
  const out: ExportTables = new Map()

  const { data, error } = await db.rpc('tenant_data_tables')
  if (error) throw new Error(`Reading the table list failed: ${error.message}`)
  const tables = (data ?? []) as TableInfo[]

  for (const info of tables) {
    const { table_name } = info
    if (EXCLUDED_TABLES.has(table_name)) continue
    const rows = await readAll(db, info, q => q.eq('tenant_id', tenantId))
    if (rows.length) out.set(table_name, rows)
  }

  const tenantColumns = await columnsOf(db, ['tenants', ...CHILD_TABLES.map(c => c.table)])
  const tenantInfo = tenantColumns.get('tenants')
  if (tenantInfo) out.set('tenants', await readAll(db, tenantInfo, q => q.eq('id', tenantId)))

  for (const child of CHILD_TABLES) {
    const childInfo = tenantColumns.get(child.table)
    const parentIds = (out.get(child.parent) ?? []).map(r => String(r.id))
    if (!childInfo || parentIds.length === 0) continue
    const rows: Row[] = []
    for (let i = 0; i < parentIds.length; i += 200) {
      const ids = parentIds.slice(i, i + 200)
      rows.push(...(await readAll(db, childInfo, q => q.in(child.key, ids))))
    }
    if (rows.length) out.set(child.table, rows)
  }

  return out
}

/** One person's own rows: profile, settings, notifications, memberships. */
export async function collectPersonalData(
  client: object,
  user: { id: string; email?: string | null; created_at?: string; last_sign_in_at?: string | null },
): Promise<ExportTables> {
  const db = client as Db
  const out: ExportTables = new Map()
  out.set('account', [{
    id: user.id,
    email: user.email ?? null,
    created_at: user.created_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
  }])
  const columns = await columnsOf(db, PERSONAL_TABLES.map(t => t.table))
  for (const { table, key } of PERSONAL_TABLES) {
    const info = columns.get(table)
    if (!info) continue
    const rows = await readAll(db, info, q => q.eq(key, user.id))
    if (rows.length) out.set(table, rows)
  }
  return out
}

/** The zip: README.txt, csv/<table>.csv and json/<table>.json. */
export async function buildExportZip(tables: ExportTables, readme: string): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const names = [...tables.keys()].sort()
  const counts = names.map(n => `  ${n}: ${tables.get(n)!.length} row(s)`).join('\n')
  zip.file('README.txt', `${readme}\n\nTables in this export:\n${counts}\n`)
  for (const name of names) {
    const rows = tables.get(name)!
    zip.file(`csv/${name}.csv`, toCsv(rows))
    zip.file(`json/${name}.json`, JSON.stringify(rows, null, 2))
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export const COMPANY_README = [
  'Autoura — company data export',
  '',
  'One CSV and one JSON file per table: the same rows in two formats.',
  'Every table that holds your company\'s data is included, with every column,',
  'except login secrets (Gmail connection tokens, and the private keys inside',
  'share and portal links), which would give whoever holds this file access.',
  '',
  'Uploaded files (contracts, supplier invoices, traveller documents, PDFs) are',
  'listed by their storage path in the tables above; download them from the',
  'app while your account is open.',
].join('\n')

export const PERSONAL_README = [
  'Autoura — your personal data',
  '',
  'Your account, profile, settings, notifications and the companies you belong',
  'to. Work you did inside a company (clients, trips, invoices) belongs to that',
  'company: ask its owner or an admin for the company export.',
].join('\n')
