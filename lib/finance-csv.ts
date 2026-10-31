// CSV export and the formula-injection guard — no jspdf here.
//
// These lived in lib/finance-export.ts beside the PDF export, so a page that
// only wanted csvCell (Quotes, Expenses) statically pulled jspdf and
// jspdf-autotable (~130 KB gzipped) into its FIRST load. Pages import CSV
// helpers from here; finance-export.ts re-exports them for older callers and
// should be loaded with `await import()` only when someone clicks "PDF".
import { format } from 'date-fns'

export interface ExportColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  format?: (value: unknown) => string
}

// ============================================
// CSV EXPORT
// ============================================

// Neutralize spreadsheet formula injection: a cell whose value starts with
// = + - @ (or tab / CR) is executed as a formula by Excel/Sheets, so an
// exported field like `=HYPERLINK(...)` or `=cmd|...` can exfiltrate data or
// run on open. Prefix such values with a single quote (the standard
// mitigation), then apply normal CSV quoting.
export function csvCell(value: unknown): string {
  const s = String(value ?? '')
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${guarded.replace(/"/g, '""')}"`
}

export function exportFinanceCSV(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string
) {
  if (data.length === 0) return

  const headers = columns.map(c => c.label)
  const rows = data.map(row =>
    columns.map(col => {
      const value = row[col.key]
      const formatted = col.format ? col.format(value) : String(value ?? '')
      return csvCell(formatted)
    })
  )

  const csvContent = [
    headers.map(h => csvCell(h)).join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
