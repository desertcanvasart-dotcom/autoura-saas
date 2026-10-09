// ============================================
// The agency's letterhead on a quote (@react-pdf)
// ============================================
// The same header and footer as every other document (lib/pdf-letterhead for
// jsPDF, components/documents/Letterhead on screen), from Settings →
// Organization. The quotes printed "AUTOURA" over Travel2Egypt's tagline,
// email and phone for every agency.

import React from 'react'
import { Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { letterheadFooterLines, type CompanyIdentity } from '@/lib/company-identity'
import { QUOTE_PDF_FONT } from '@/lib/pdf/quote-fonts'

const FALLBACK = '#647C47'

export function quoteBrandColor(company: CompanyIdentity): string {
  const hex = company.primaryColor?.trim() ?? ''
  return /^#?[0-9a-fA-F]{6}$/.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : FALLBACK
}

/** The brand colour and a pale tint of it, for a quote's accents. */
export function quotePalette(company: CompanyIdentity): { main: string; light: string } {
  const main = quoteBrandColor(company)
  const n = parseInt(main.slice(1), 16)
  const mix = (v: number) => Math.round(v + (255 - v) * 0.9).toString(16).padStart(2, '0')
  return { main, light: `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}` }
}

/** Bottom padding a page needs so content stays clear of the footer. */
export const QUOTE_FOOTER_SPACE = 95

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingBottom: 14, marginBottom: 22, borderBottom: '1 solid #e5e7eb',
  },
  brand: { flexDirection: 'row', alignItems: 'center', maxWidth: '62%' },
  logo: { width: 90, height: 42, objectFit: 'contain', marginRight: 12 },
  name: { fontSize: 18, fontFamily: QUOTE_PDF_FONT, fontWeight: 'bold' },
  tagline: { fontSize: 9, color: '#6b7280', marginTop: 3 },
  right: { alignItems: 'flex-end' },
  title: { fontSize: 8, fontFamily: QUOTE_PDF_FONT, fontWeight: 'bold', letterSpacing: 1.2 },
  number: { fontSize: 14, fontFamily: QUOTE_PDF_FONT, fontWeight: 'bold', color: '#1f2937', marginTop: 3 },
  date: { fontSize: 8, color: '#6b7280', marginTop: 3 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40 },
  footerRule: { borderTopWidth: 1, marginBottom: 6 },
  footerName: { fontSize: 8, fontFamily: QUOTE_PDF_FONT, fontWeight: 'bold', color: '#1f2937', textAlign: 'center' },
  footerLine: { fontSize: 7, color: '#6b7280', textAlign: 'center', marginTop: 2 },
  footerNote: { fontSize: 6.5, color: '#9ca3af', textAlign: 'center', marginTop: 3 },
  pageNo: { fontSize: 6.5, color: '#9ca3af', textAlign: 'right', marginTop: 4 },
})

export function QuoteHeader({
  company, title, number, date,
}: { company: CompanyIdentity; title: string; number: string; date?: string }) {
  const color = quoteBrandColor(company)
  return (
    <>
      <View style={[styles.bar, { backgroundColor: color }]} fixed />
      <View style={styles.header}>
        <View style={styles.brand}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt */}
          {company.logoDataUrl && <Image src={company.logoDataUrl} style={styles.logo} />}
          <View>
            {company.name ? <Text style={[styles.name, { color }]}>{company.name}</Text> : null}
            {company.tagline ? <Text style={styles.tagline}>{company.tagline}</Text> : null}
          </View>
        </View>
        <View style={styles.right}>
          <Text style={[styles.title, { color }]}>{title.toUpperCase()}</Text>
          <Text style={styles.number}>{number}</Text>
          {date ? <Text style={styles.date}>{date}</Text> : null}
        </View>
      </View>
    </>
  )
}

/** The thin brand bar alone, for a document's second <Page> (no header there). */
export function QuoteTopBar({ company }: { company: CompanyIdentity }) {
  return <View style={[styles.bar, { backgroundColor: quoteBrandColor(company) }]} fixed />
}

/** On every page (`fixed`), with page numbers when there is more than one. */
export function QuoteFooter({ company }: { company: CompanyIdentity }) {
  const color = quoteBrandColor(company)
  const lines = letterheadFooterLines(company)
  return (
    <View style={styles.footer} fixed>
      <View style={[styles.footerRule, { borderTopColor: color }]} />
      {company.name ? <Text style={styles.footerName}>{company.name}</Text> : null}
      {lines.map(l => <Text key={l} style={styles.footerLine}>{l}</Text>)}
      {company.footerText ? <Text style={styles.footerNote}>{company.footerText}</Text> : null}
      <Text
        style={styles.pageNo}
        render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : '')}
      />
    </View>
  )
}
