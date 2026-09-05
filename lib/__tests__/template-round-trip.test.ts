import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import {
  RATE_TABLE_CONFIGS,
  getTemplateHeaders,
  buildTemplateRow,
  validateImportData,
} from '@/lib/bulk-rate-service'

// ============================================
// The Sample CSV is the CONTRACT (2026-09-05)
// ============================================
// The promise to the user: download the Sample CSV, replace the example
// values with your own data, upload — it imports. That only holds if the
// template's own example row passes the importer's validation for every
// table. A template that fails its own import is a contract nobody can
// follow.

describe('every Sample CSV example row passes its own import validation', () => {
  for (const [table, config] of Object.entries(RATE_TABLE_CONFIGS)) {
    it(table, () => {
      const csv = Papa.unparse({ fields: getTemplateHeaders(config), data: [buildTemplateRow(config)] })
      const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim(),
      })
      const preview = validateImportData(parsed.data, config)
      expect(
        preview.errors,
        `${table} template's example row fails its own import:\n` +
          preview.errors.map(e => `  row ${e.row} ${e.column}: ${e.message}`).join('\n')
      ).toEqual([])
      expect(preview.invalidRows).toBe(0)
    })
  }
})
