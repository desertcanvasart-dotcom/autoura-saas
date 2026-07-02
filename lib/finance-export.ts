import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'

// ============================================
// TYPES
// ============================================

export interface ExportColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  format?: (value: unknown) => string
}

export interface ExportSummaryItem {
  label: string
  value: string
}

export interface PDFExportOptions {
  title: string
  subtitle?: string
  summary?: ExportSummaryItem[]
  data: Record<string, unknown>[]
  columns: ExportColumn[]
  filename: string
  orientation?: 'portrait' | 'landscape'
}

// ============================================
// CSV EXPORT
// ============================================

// Neutralize spreadsheet formula injection: a cell whose value starts with
// = + - @ (or tab / CR) is executed as a formula by Excel/Sheets, so an
// exported field like `=HYPERLINK(...)` or `=cmd|...` can exfiltrate data or
// run on open. Prefix such values with a single quote (the standard
// mitigation), then apply normal CSV quoting.
export function csvCell(value: string): string {
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

// ============================================
// PDF EXPORT
// ============================================

export function exportFinancePDF(options: PDFExportOptions) {
  const { title, subtitle, summary, data, columns, filename, orientation = 'landscape' } = options

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let yPos = margin

  // ── Header ──
  doc.setFontSize(8)
  doc.setTextColor(100, 124, 71) // #647C47
  doc.text('AUTOURA', margin, yPos)
  doc.setTextColor(150)
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy HH:mm')}`, pageWidth - margin, yPos, { align: 'right' })

  yPos += 10

  // ── Title ──
  doc.setFontSize(18)
  doc.setTextColor(30)
  doc.text(title, margin, yPos)
  yPos += 7

  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(subtitle, margin, yPos)
    yPos += 7
  }

  // ── Summary Cards ──
  if (summary && summary.length > 0) {
    yPos += 3
    const cardWidth = (pageWidth - margin * 2 - (summary.length - 1) * 4) / summary.length
    const cardHeight = 18

    summary.forEach((item, i) => {
      const x = margin + i * (cardWidth + 4)

      // Card background
      doc.setFillColor(245, 245, 240)
      doc.roundedRect(x, yPos, cardWidth, cardHeight, 2, 2, 'F')

      // Label
      doc.setFontSize(7)
      doc.setTextColor(130)
      doc.text(item.label, x + 4, yPos + 6)

      // Value
      doc.setFontSize(12)
      doc.setTextColor(30)
      doc.text(item.value, x + 4, yPos + 14)
    })

    yPos += cardHeight + 6
  }

  // ── Separator line ──
  yPos += 2
  doc.setDrawColor(220)
  doc.setLineWidth(0.3)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 5

  // ── Data Table ──
  if (data.length > 0) {
    const tableColumns = columns.map(col => ({
      header: col.label,
      dataKey: col.key,
    }))

    const tableRows = data.map(row => {
      const mapped: Record<string, string> = {}
      columns.forEach(col => {
        const value = row[col.key]
        mapped[col.key] = col.format ? col.format(value) : String(value ?? '')
      })
      return mapped
    })

    const columnStyles: Record<string, { halign: 'left' | 'right' | 'center' }> = {}
    columns.forEach(col => {
      if (col.align) {
        columnStyles[col.key] = { halign: col.align }
      }
    })

    autoTable(doc, {
      startY: yPos,
      columns: tableColumns,
      body: tableRows,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: [100, 124, 71],
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2.5,
        textColor: [50, 50, 50],
      },
      alternateRowStyles: {
        fillColor: [250, 250, 247],
      },
      columnStyles,
      didDrawPage: () => {
        // Footer on every page
        const pageHeight = doc.internal.pageSize.getHeight()
        doc.setFontSize(7)
        doc.setTextColor(180)
        doc.text(
          `${title} — Generated by Autoura`,
          margin,
          pageHeight - 8
        )
        doc.text(
          `Page ${doc.getCurrentPageInfo().pageNumber}`,
          pageWidth - margin,
          pageHeight - 8,
          { align: 'right' }
        )
      },
    })
  } else {
    doc.setFontSize(10)
    doc.setTextColor(150)
    doc.text('No data available for this report.', margin, yPos + 10)
  }

  // ── Save ──
  doc.save(`${filename}-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
}
