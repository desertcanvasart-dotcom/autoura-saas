import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { RATE_TABLE_CONFIGS, validateImportData, isExampleRow, importRowKey, partitionImportRows, applyCanonicalAliases, deriveImportSeasons, propertyLinkFor, parseCsvBoolean, isBlankCsvCell, EXAMPLE_ROW_KEY, importIdentityKey } from '@/lib/bulk-rate-service'
import type { ImportResult } from '@/lib/bulk-rate-service'
import Papa from 'papaparse'
import { detectPeriodsCsv, parsePeriodsCsv, PERIODS_CSV_TABLES, keepStoredPeriods } from '@/lib/rates/periods-csv'
import { usesOneSheet, detectOneSheet, parseOneSheet, oneSheetEntity } from '@/lib/rates/rate-sheet'
import { parseSailingDaysCell } from '@/lib/rates/cruise-sailing'
import { parseTiersCell } from '@/lib/rates/activity-tiers'
import { sanitizeSeasons, legacyColumnMirror, type RateSeason } from '@/lib/rates/rate-seasons'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { resolveRecordKeys, resolveVocabularyKey, vocabularyColumnsFor, type VocabularyKind, type VocabularyItem } from '@/lib/vocabulary'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { linkRowsBySupplierName, supplierNameGapMessage } from '@/lib/rates/link-supplier-by-name'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { clearPreferredSiblings, describeScope, isPreferredTable, PREFERRED_SCOPES } from '@/lib/rates/preferred'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { table, csvData, dryRun = false } = body

    if (!table || !RATE_TABLE_CONFIGS[table]) {
      return NextResponse.json({ success: false, error: `Invalid table. Supported: ${Object.keys(RATE_TABLE_CONFIGS).join(', ')}` }, { status: 400 })
    }
    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }

    const config = RATE_TABLE_CONFIGS[table]

    const parsed = Papa.parse<Record<string, string>>(csvData, {
      header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim(),
    })

    if (parsed.errors.length > 0) {
      return NextResponse.json({ success: false, error: 'CSV parsing failed', details: parsed.errors.slice(0, 10) }, { status: 400 })
    }

    const rows = parsed.data
    if (rows.length === 0) return NextResponse.json({ success: false, error: 'No data rows' }, { status: 400 })

    // ---- Periods-format rate sheet (one row per contract period) ----
    // Detected by its headers; the flat format cannot trip this. Periods
    // UPDATE an existing property's rate windows — a rate sheet never
    // creates a property (it has no city or tier to create one with).
    const periodsTarget = PERIODS_CSV_TABLES[table]
    if (periodsTarget && detectPeriodsCsv(parsed.meta.fields ?? [])) {
      const sheet = parsePeriodsCsv(rows)
      const validRows = sheet.totalRows - sheet.errors.length
      if (dryRun) {
        return NextResponse.json({
          success: true, dryRun: true,
          totalRows: sheet.totalRows, validRows, invalidRows: sheet.errors.length,
          errors: sheet.errors, sampleData: [],
        })
      }
      if (sheet.errors.length > 0) {
        return NextResponse.json({
          success: false, error: `${sheet.errors.length} rows have errors`,
          totalRows: sheet.totalRows, validRows, invalidRows: sheet.errors.length, errors: sheet.errors,
        })
      }

      let updated = 0
      const periodErrors: Array<{ row: string; message: string }> = []
      const seasonVocab = await loadVocabulary(supabase, 'rate_season')
      for (const group of sheet.groups) {
        interface PropRow { id: string }
        let query = supabase
          .from(periodsTarget.entity === 'accommodation' ? 'accommodation_rates' : 'nile_cruises')
          .select('id')
          .eq('tenant_id', tenant_id)
        query = group.service_code
          ? query.eq(periodsTarget.codeColumn, group.service_code)
          : query.ilike(periodsTarget.nameColumn, group.property_name ?? '')
        const { data: matches } = await (query as unknown as PromiseLike<{ data: PropRow[] | null }>)

        const label = group.property_name || group.service_code || group.key
        if (!matches || matches.length === 0) {
          periodErrors.push({ row: label, message: `No existing ${periodsTarget.entity === 'accommodation' ? 'hotel' : 'cruise'} matches "${label}" — ${periodsTarget.createHint}.` })
          continue
        }
        if (matches.length > 1) {
          periodErrors.push({ row: label, message: `"${label}" matches ${matches.length} rows — give each row its Service Code so the periods land on the right one.` })
          continue
        }

        // The Season cell is a word from the agency's rate_season vocabulary —
        // its key or its label ("Christmas"). Resolved to the key; a word not
        // in the list refuses the rate rather than storing something nothing
        // will ever show.
        const seasonWords = group.periods.map(p => p.season).filter(Boolean) as string[]
        if (seasonWords.length > 0) {
          const unknown = seasonWords.filter(w => !resolveVocabularyKey(seasonVocab, w))
          if (unknown.length > 0) {
            periodErrors.push({ row: label, message: `Season "${[...new Set(unknown)].join('", "')}" is not in your rate seasons list (Settings → Your vocabulary → Rate seasons).` })
            continue
          }
        }
        const periodsWithKeys = group.periods.map(p => (p.season ? { ...p, season: resolveVocabularyKey(seasonVocab, p.season) ?? undefined } : p))
        const seasons = sanitizeSeasons(periodsWithKeys, periodsTarget.entity) ?? []
        const { error } = await supabase
          .from(periodsTarget.entity === 'accommodation' ? 'accommodation_rates' : 'nile_cruises')
          .update({
            seasons,
            ...legacyColumnMirror(seasons, periodsTarget.entity),
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', matches[0].id)
          .eq('tenant_id', tenant_id)
        if (error) periodErrors.push({ row: label, message: error.message })
        else updated++
      }

      return NextResponse.json({
        success: periodErrors.length === 0,
        totalRows: sheet.totalRows, validRows, invalidRows: 0,
        inserted: 0, updated, refusedDuplicates: 0, exampleRowsSkipped: 0,
        errors: periodErrors,
      })
    }

    // ---- The one sheet (hotels, cruises): a row per dated period ----
    // lib/rates/rate-sheet.ts. Grouped back into one row per property (its
    // details) plus the periods the file lists for it; from there it runs
    // through the same pipeline as a flat file, with the periods attached.
    let importRows = rows
    let periodsForRow: RateSeason[][] | null = null
    let fileLineOf: number[] | null = null
    if (usesOneSheet(table) && detectOneSheet(parsed.meta.fields ?? [])) {
      const entity = oneSheetEntity(table)!
      const sheet = parseOneSheet(rows, config)
      const seasonVocab = await loadVocabulary(supabase, 'rate_season')
      const sheetErrors = [...sheet.errors]
      const resolvedPeriods = sheet.groups.map(g => {
        const withKeys = g.periods.map(p => {
          if (!p.season) return p
          const key = resolveVocabularyKey(seasonVocab, p.season)
          if (!key) {
            sheetErrors.push({ row: g.line, column: 'period_season', message: `Season "${p.season}" is not in your rate seasons list (Settings → Your vocabulary → Rate seasons).` })
          }
          return { ...p, season: key ?? undefined }
        })
        return sanitizeSeasons(withKeys, entity) ?? []
      })
      if (sheetErrors.length > 0) {
        const body = { totalRows: rows.length, validRows: 0, invalidRows: sheetErrors.length, errors: sheetErrors, sampleData: [] }
        if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...body })
        return NextResponse.json({ success: false, error: `${sheetErrors.length} rows have errors`, ...body })
      }
      importRows = sheet.groups.map(g => g.details)
      periodsForRow = resolvedPeriods
      fileLineOf = sheet.groups.map(g => g.line)
    }
    // A message's row number is the FILE's line, also when rows were grouped.
    const lineOf = (i: number) => (fileLineOf ? fileLineOf[i] : i + 2)

    const preview = validateImportData(importRows, config)
    if (fileLineOf) {
      for (const e of preview.errors) e.row = lineOf(e.row - 2)
    }

    // The sheet says "Deluxe", "BB", "Sedan"; rows store the agency's keys
    // (Settings → Your vocabulary). Resolve every vocabulary column up front
    // so the preview names a word the agency does not use, and nothing is
    // written under a word it does not use.
    const vocabColumns = Object.fromEntries(
      Object.entries(vocabularyColumnsFor(config.tableName)).filter(([column]) => config.columns.some(c => c.name === column && !c.exportOnly))
    ) as Record<string, VocabularyKind>
    const vocab: Partial<Record<VocabularyKind, VocabularyItem[]>> = {}
    for (const kind of new Set(Object.values(vocabColumns))) vocab[kind] = await loadVocabulary(supabase, kind)
    const vocabErrors: Array<{ row: number; column: string; message: string }> = []
    const resolvedRows = importRows.map((row, i) => {
      // The sample's example row is skipped below; its words ("standard",
      // "bb") must not refuse the file for an agency that renamed them.
      if (isExampleRow(row[config.uniqueKey[0]])) return row
      const { record, errors } = resolveRecordKeys(row, vocab, vocabColumns)
      for (const message of errors) vocabErrors.push({ row: lineOf(i), column: message.split(':')[0], message })
      return record as Record<string, string>
    })
    if (vocabErrors.length > 0) {
      const merged = { ...preview, invalidRows: preview.invalidRows + vocabErrors.length, validRows: Math.max(0, preview.validRows - vocabErrors.length), errors: [...preview.errors, ...vocabErrors] }
      if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...merged })
      return NextResponse.json({ success: false, error: `${merged.invalidRows} rows have errors`, ...merged })
    }
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...preview })
    if (preview.invalidRows > 0) return NextResponse.json({ success: false, error: `${preview.invalidRows} rows have errors`, ...preview })

    // The config's tableName is dynamic; the typed client cannot narrow it.
    interface DynamicFilter extends PromiseLike<{ error: { message: string } | null }> {
      eq(c: string, v: unknown): DynamicFilter
    }
    interface DynamicTable {
      select(columns: string): {
        in(column: string, values: unknown[]): {
          eq(c: string, v: unknown): PromiseLike<{ data: Record<string, unknown>[] | null }>
        }
      }
      insert(rows: Record<string, unknown>[]): PromiseLike<{ error: { message: string } | null }>
      update(row: Record<string, unknown>): DynamicFilter
    }
    const dynTable = () => supabase.from(config.tableName as 'accommodation_rates') as unknown as DynamicTable

    const importableColumns = config.columns.filter(c => !c.exportOnly)
    // Matching uses the FULL natural key (config.uniqueKey), never just its
    // first column — single-column matching is how a second, legitimately
    // distinct rate silently replaced the first (A-item 5). The first key
    // column still identifies the template's example row.
    const uniqueKey = config.uniqueKey
    const uniqueKeyColumn = uniqueKey[0]

    const rowsToUpsert: Record<string, any>[] = []
    let exampleRowsSkipped = 0
    for (const [rowIndex, row] of resolvedRows.entries()) {
      // The downloaded template ships one filled-in example row. Skip it, so
      // the classic mistake -- filling in the sheet underneath and importing
      // the sample along with it -- cannot land a junk rate.
      if (isExampleRow(row[uniqueKeyColumn])) {
        exampleRowsSkipped++
        continue
      }

      const record: Record<string, any> = { tenant_id }
      for (const colDef of importableColumns) {
        const raw = (row[colDef.name] ?? '').trim()
        // The validator's rules, exactly: "NULL" is blank there, so it must be
        // blank here too (it was written as NaN → null over the stored value),
        // and a "Y" it accepted is yes (it was stored as false).
        if (isBlankCsvCell(raw)) continue
        switch (colDef.type) {
          case 'number': record[colDef.name] = Number(raw); break
          case 'boolean': record[colDef.name] = parseCsvBoolean(raw) === true; break
          default: record[colDef.name] = colDef.name === 'rate_currency' ? raw.toUpperCase() : raw
        }
      }

      // Activity bands arrive as the cell ("1-4:25; 5-8:40"); the table stores
      // the list. (A bad cell was refused by validateImportData already.)
      if (config.tableName === 'activity_rates' && typeof record.tiers === 'string') {
        const res = parseTiersCell(record.tiers)
        if ('tiers' in res) record.tiers = res.tiers
        else delete record.tiers
      }

      // A meal's dietary options: the cell's list, stored as the form stores it.
      if (typeof record.dietary_options === 'string') {
        record.dietary_options = record.dietary_options.split(/[;|]/).map((x: string) => x.trim()).filter(Boolean)
      }

      // Sailing days arrive as the cell's words ("mon;fri"); the table stores
      // the keys. Blank already skipped above; "any" stores none. (Bad words
      // were refused by validateImportData before anything is written.)
      if (typeof record.sailing_days === 'string') {
        const { days } = parseSailingDaysCell(record.sailing_days)
        if (days) record.sailing_days = days
        else delete record.sailing_days
      }

      // The passport-split columns are no longer in the template, and this
      // route builds its own records rather than reusing validateImportData --
      // so the mirror has to happen HERE too, or a file written from the
      // current template lands priced for one passport and blank for the other.
      for (const colDef of importableColumns) {
        if (!colDef.mirrorFrom) continue
        if (record[colDef.name] == null && record[colDef.mirrorFrom] != null) {
          record[colDef.name] = record[colDef.mirrorFrom]
        }
      }

      // Heal the accommodation split-brain at the write boundary: fill both
      // column families and turn dated season columns into real periods.
      // One sheet: the periods the file lists ARE the rate — period 1 mirrored
      // onto the price columns, as the rate form does on every save.
      const listed = periodsForRow?.[rowIndex]
      if (listed && listed.length > 0 && periodsTarget) {
        record.seasons = listed
        Object.assign(record, legacyColumnMirror(listed, periodsTarget.entity))
      }

      applyCanonicalAliases(table, record)
      deriveImportSeasons(table, record)

      rowsToUpsert.push(record)
    }

    if (rowsToUpsert.length === 0 && exampleRowsSkipped > 0) {
      return NextResponse.json({
        success: false,
        error: `Every row is still the sample's example row (${EXAMPLE_ROW_KEY}). Fill in your own rates, delete the example row, and import again.`,
        totalRows: importRows.length, validRows: 0, invalidRows: 0, inserted: 0, updated: 0, exampleRowsSkipped,
      }, { status: 400 })
    }

    // supplier_code is the portable cross-install key. Resolve it to THIS
    // tenant's supplier_id FIRST — it wins over the incoming supplier_id, which
    // is the other install's UUID and meaningless here. A code that matches no
    // supplier in this tenant errors and drops the row (suppliers must be
    // migrated before their rates) rather than silently importing it unlinked.
    // The column is virtual — no rate table stores it — so it is stripped from
    // every row afterwards.
    const supplierCodeErrors: any[] = []
    {
      const codes = [...new Set(rowsToUpsert.map(r => String(r.supplier_code ?? '').trim()).filter(Boolean))]
      if (codes.length > 0) {
        // Every code of this tenant's, matched whatever its case: an exact
        // .in() found no "SUP-0001" for a sheet saying "sup-0001", and the
        // row was refused as an unknown supplier. Paged past 1,000.
        const { data: byCode } = await fetchAllPages((from, to) => supabase
          .from('suppliers')
          .select('id, supplier_code')
          .eq('tenant_id', tenant_id)
          .not('supplier_code', 'is', null)
          .order('id', { ascending: true })
          .range(from, to)) as { data: Array<{ id: string; supplier_code: string | null }> | null }
        const idByCode = new Map((byCode ?? []).filter(s => s.supplier_code).map(s => [String(s.supplier_code).toLowerCase(), s.id]))
        const survivors: Record<string, any>[] = []
        for (const r of rowsToUpsert) {
          const code = String(r.supplier_code ?? '').trim()
          if (!code) { survivors.push(r); continue }
          const id = idByCode.get(code.toLowerCase())
          if (id) { r.supplier_id = id; survivors.push(r) }
          else supplierCodeErrors.push({
            row: uniqueKey.map(c => `${c}=${String(r[c] ?? '')}`).join(', '),
            operation: 'refused',
            message: `supplier_code "${code}" matches no supplier here — migrate suppliers before their rates, or fix the code`,
          })
        }
        rowsToUpsert.length = 0
        rowsToUpsert.push(...survivors)
      }
      for (const r of rowsToUpsert) delete r.supplier_code
    }

    // supplier_id is a LINK, not a rate: a file exported from another system
    // (the sibling app's template carries its own supplier UUIDs) names
    // suppliers this database has never seen, and the FK then fails EVERY
    // batch — 119 good rates bounced for a link. Unknown ids are cleared and
    // reported; the rates land, the supplier link is a named gap to fix.
    let supplierLinksCleared = 0
    {
      const ids = [...new Set(rowsToUpsert.map(r => r.supplier_id).filter(Boolean))] as string[]
      if (ids.length > 0) {
        const { data: known } = await (supabase
          .from('suppliers') as unknown as {
            select(c: string): { in(c: string, v: string[]): { eq(c: string, v: string): PromiseLike<{ data: Array<{ id: string }> | null }> } }
          })
          .select('id')
          .in('id', ids)
          .eq('tenant_id', tenant_id)
        const knownIds = new Set((known ?? []).map(r => r.id))
        for (const r of rowsToUpsert) {
          if (r.supplier_id && !knownIds.has(r.supplier_id)) {
            delete r.supplier_id
            supplierLinksCleared++
          }
        }
      }
    }

    // supplier_name is what a HUMAN writes. The sample sheet offers the column,
    // the export fills it and the form's dropdown stores a real link — but the
    // import only ever resolved supplier_code and supplier_id, so a sheet
    // filled in by hand landed with the company's NAME and no link to it.
    // The rule itself is in lib/rates/link-supplier-by-name.ts, with the live
    // evidence that found it.
    let supplierNamesLinked = 0
    const supplierNameGaps: Array<{ row: string; operation: string; message: string }> = []
    {
      const needsLink = rowsToUpsert.some(
        r => !r.supplier_id && String(r.supplier_name ?? '').trim()
      )
      if (needsLink) {
        // Paged: a plain select stops at 1000 rows, so a name past the
        // 1000th supplier never linked (documents audit, round 12).
        const { data: all } = await fetchAllPages((from, to) => supabase
          .from('suppliers')
          .select('id, name')
          .eq('tenant_id', tenant_id)
          .order('id', { ascending: true })
          .range(from, to))

        const result = linkRowsBySupplierName(rowsToUpsert, all ?? [])
        supplierNamesLinked = result.linked
        for (const gap of result.gaps) {
          supplierNameGaps.push({
            row: uniqueKey.map(c => `${c}=${String((gap.row as Record<string, unknown>)[c] ?? '')}`).join(', '),
            operation: 'imported unlinked',
            message: supplierNameGapMessage(gap),
          })
        }
      }
    }

    // WHICH ship / hotel / train this rate prices. The rate FORMS resolve this
    // on every save; the bulk import never did, so export → delete → re-import
    // came back with every property link NULL — visibly so on trains, whose
    // name lives only on supplier_properties (2026-09-14).
    //
    // The name is the portable key, resolved under the row's OWN supplier —
    // after the supplier resolution above, so it resolves against THIS tenant's
    // supplier_id and never the foreign UUID the file arrived with. Resolved
    // once per distinct (supplier, name) pair, not once per row: a fleet has a
    // handful of ships and hundreds of rates.
    let propertyLinksUnresolved = 0
    {
      const link = propertyLinkFor(config.tableName)
      if (link) {
        const nameOf = (r: Record<string, unknown>) => String(r[link.nameColumn] ?? '').trim()
        const supplierOf = (r: Record<string, unknown>) => String(r.supplier_id ?? '').trim()
        const resolved = new Map<string, string | null>()
        for (const r of rowsToUpsert) {
          const name = nameOf(r)
          const supplierId = supplierOf(r)
          if (!supplierId || !name) continue
          const cacheKey = `${supplierId}::${name.toLowerCase()}`
          if (!resolved.has(cacheKey)) {
            const prop = await resolveRateProperty(supabase, {
              tenantId: tenant_id,
              propertyType: link.propertyType,
              supplierId,
              name,
            })
            resolved.set(cacheKey, prop.property_id)
          }
          const propertyId = resolved.get(cacheKey) ?? null
          // Omitted when null so an install that has not run migration 311/313
          // still imports its rates — the link is a named gap, never a refusal.
          if (propertyId) r.property_id = propertyId
        }
        // A row that named a property but could not be linked: no supplier to
        // hang it from, or the find-or-create lost its race. Reported, never
        // silent — the rate itself still lands.
        for (const r of rowsToUpsert) {
          if (nameOf(r) && !r.property_id) propertyLinksUnresolved++
        }
        // Virtual column: no train table has one, so it must not reach the
        // insert (the same contract supplier_code keeps above).
        if (link.virtual) for (const r of rowsToUpsert) delete r[link.nameColumn]
      }
    }

    // Two rows in the same file sharing one natural key: the second would
    // silently overwrite the first ("13 creates, 0 inserts"). Refuse them
    // row-wise with the collision named, import the rest.
    const partition = partitionImportRows(rowsToUpsert, uniqueKey)
    // Two rows with no code that name the same rate: the second would update
    // what the first just wrote. Refused, as two rows sharing a code are.
    if (config.identityKey) {
      const seenIdentity = new Set<string>()
      partition.rows = partition.rows.filter(r => {
        if (importRowKey(r, uniqueKey) !== null) return true
        const ident = importIdentityKey(r, config.identityKey!)
        if (ident === null) return true
        if (!seenIdentity.has(ident)) { seenIdentity.add(ident); return true }
        partition.duplicates.push({
          record: r,
          message: `Two rows in this file have no ${uniqueKey.join(' + ')} and the same ${config.identityKey!.join(' + ')} — give them codes, or merge them.`,
        })
        return false
      })
    }

    let inserted = 0, updated = 0
    const periodsKept: Array<{ row: string; operation: string; message: string }> = []
    const importErrors: any[] = [
      ...supplierCodeErrors,
      ...partition.duplicates.map(d => ({
        row: uniqueKey.map(c => `${c}=${String(d.record[c])}`).join(', '),
        operation: 'refused',
        message: d.message,
      })),
    ]
    const BATCH_SIZE = 50

    // Existence is checked on the FULL key, scoped to THIS tenant, and
    // whatever the case: the key compares lower-cased (importRowKey), so the
    // stored rows are read whole and the update is aimed at the STORED values
    // — an exact .in()/.eq() on the file's "luxor" missed the stored "Luxor"
    // and counted an update that wrote nothing, or inserted a twin. Paged.
    // Two stored rates sharing one key are not updated at all: one row of the
    // file would have overwritten both.
    const storedByKey = new Map<string, Array<Record<string, unknown>>>()
    // A row with no code is matched on what identifies the rate (identityKey)
    // — the hotel and city, the restaurant and meal — instead of being added
    // again on every import of the same hand-filled sheet.
    const storedByIdentity = new Map<string, Array<Record<string, unknown>>>()
    {
      const { data: existing } = await fetchAllPages((from, to) => (supabase
        .from(config.tableName as 'accommodation_rates') as unknown as {
          select(c: string): { eq(c: string, v: string): { order(c: string, o: { ascending: boolean }): { range(a: number, b: number): PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }> } } }
        })
        .select([...new Set(['id', ...uniqueKey, ...(config.identityKey ?? []), ...(periodsTarget ? ['seasons'] : [])])].join(', '))
        .eq('tenant_id', tenant_id)
        .order('id', { ascending: true })
        .range(from, to))
      for (const row of existing ?? []) {
        const key = importRowKey(row, uniqueKey)
        if (key !== null) {
          const list = storedByKey.get(key)
          if (list) list.push(row)
          else storedByKey.set(key, [row])
        }
        const ident = config.identityKey ? importIdentityKey(row, config.identityKey) : null
        if (ident !== null) {
          const list = storedByIdentity.get(ident)
          if (list) list.push(row)
          else storedByIdentity.set(ident, [row])
        }
      }
    }

    // One preferred rate per scope (migration 354's unique index): the star
    // toggle clears a row's siblings first, the import did not — a sheet
    // marking a second preferred restaurant for a tier and meal failed its
    // whole batch on the index. Now the same as the toggle: the file's
    // preferred row clears the stored one; two in one file, the second is
    // imported without the star and named.
    if (isPreferredTable(config.tableName)) {
      const table = config.tableName
      const scopeCols = PREFERRED_SCOPES[table].columns
      const scopeOf = (r: Record<string, unknown>) => scopeCols.map(c => String(r[c] ?? '').trim().toLowerCase()).join('\u0000')
      const claimed = new Set<string>()
      for (const r of partition.rows) {
        if (r.is_preferred !== true) continue
        const scope = scopeOf(r)
        if (claimed.has(scope)) {
          r.is_preferred = false
          importErrors.push({
            row: uniqueKey.map(c => `${c}=${String(r[c] ?? '')}`).join(', '),
            operation: 'imported without the star',
            message: `Another row in this file is already the preferred one for ${describeScope(table, r) || 'this scope'} — only one can be.`,
          })
          continue
        }
        claimed.add(scope)
        const k = importRowKey(r, uniqueKey)
        const stored = k !== null ? storedByKey.get(k) : undefined
        const ownId = stored?.length === 1 ? String(stored[0].id) : '00000000-0000-0000-0000-000000000000'
        const cleared = await clearPreferredSiblings(supabase, table, tenant_id, r, ownId)
        if (cleared.error) importErrors.push({ row: uniqueKey.map(c => `${c}=${String(r[c] ?? '')}`).join(', '), message: cleared.error })
      }
    }

    for (let i = 0; i < partition.rows.length; i += BATCH_SIZE) {
      const batch = partition.rows.slice(i, i + BATCH_SIZE)
      const keyOf = (r: Record<string, unknown>) => importRowKey(r, uniqueKey)
      const matchesOf = (r: Record<string, unknown>) => {
        const k = keyOf(r)
        if (k !== null) return storedByKey.get(k) ?? []
        const ident = config.identityKey ? importIdentityKey(r, config.identityKey) : null
        return ident === null ? [] : storedByIdentity.get(ident) ?? []
      }
      const toInsert = batch.filter(r => matchesOf(r).length === 0)
      const toUpdate = batch.filter(r => matchesOf(r).length === 1)
      for (const r of batch.filter(r => matchesOf(r).length > 1)) {
        importErrors.push({
          row: uniqueKey.map(c => `${c}=${String(r[c] ?? '')}`).join(', '),
          operation: 'refused',
          message: keyOf(r) !== null
            ? `${matchesOf(r).length} of your rates share this ${uniqueKey.join(' + ')} — give each its own code in the app first, so one row cannot overwrite them all.`
            : `${matchesOf(r).length} of your rates match this row's ${(config.identityKey ?? []).join(' + ')} — add the ${uniqueKey.join(' + ')} of the one it means.`,
        })
      }

      if (toInsert.length > 0) {
        const { error } = await dynTable().insert(toInsert)
        if (error) importErrors.push({ batch: Math.floor(i / BATCH_SIZE) + 1, operation: 'insert', message: error.message })
        else inserted += toInsert.length
      }

      for (const record of toUpdate) {
        const updateData = { ...record }
        for (const col of uniqueKey) delete updateData[col]
        delete updateData.tenant_id
        // This flat sheet is one row per property with room for ONE dated
        // period (plus the old high/peak columns). Re-importing it onto a
        // hotel that has five replaced the five with what the row could say
        // — silently, four periods gone (operator, 2026-09-24). A row's
        // periods are never shrunk from here: they stay as stored, and the
        // price columns keep mirroring period 1. Periods change through the
        // one sheet (Export CSV → edit → Import) or the rate form.
        // One sheet: the file's periods replace the stored ones (a period
        // deleted from the file is deleted) — unless it lists none for this
        // property, which never wipes.
        const fileSaysPeriods = periodsForRow !== null && Array.isArray(updateData.seasons)
        if (periodsTarget && !fileSaysPeriods) {
          // Hotels/cruises: the periods the matched row holds now.
          const kept = keepStoredPeriods(updateData, matchesOf(record)[0]?.seasons, periodsTarget.entity)
          if (kept) {
            periodsKept.push({
              row: uniqueKey.map(c => `${c}=${String(record[c])}`).join(', '),
              operation: 'periods kept',
              message: `${String(record[uniqueKeyColumn])} kept its ${kept.kept} rate periods — this sheet holds only ${kept.incoming || 'no'} period${kept.incoming === 1 ? '' : 's'}. To change periods, use Export CSV (a row per period), edit, and import it.`,
            })
          }
        }
        // Aimed at the one stored row this key matched, by its id.
        const target = matchesOf(record)[0]
        const updateQuery = dynTable().update(updateData).eq('tenant_id', tenant_id).eq('id', target.id)
        const { error } = await updateQuery
        if (error) importErrors.push({ row: uniqueKey.map(c => `${c}=${String(record[c])}`).join(', '), message: error.message })
        else updated++
      }
    }

    // A company name that matched nothing is REPORTED, not a failure: the rate
    // itself imported cleanly and the missing link is something to fix in
    // Suppliers, not a reason to tell the operator the import broke.
    return NextResponse.json({ success: importErrors.length === 0, totalRows: importRows.length, validRows: preview.validRows, invalidRows: preview.invalidRows, inserted, updated, refusedDuplicates: partition.duplicates.length, exampleRowsSkipped, supplierLinksCleared, supplierNamesLinked, supplierNameGaps: supplierNameGaps.length, propertyLinksUnresolved, supplierCodeErrors: supplierCodeErrors.length, periodsKept: periodsKept.length, errors: [...importErrors, ...supplierNameGaps, ...periodsKept] })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
