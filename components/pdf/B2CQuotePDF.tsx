import React from 'react'
import type { CompanyIdentity } from '@/lib/company-identity'
import { QuoteHeader, QuoteFooter, quotePalette, QUOTE_FOOTER_SPACE } from './QuoteLetterhead'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { QUOTE_PDF_FONT } from '@/lib/pdf/quote-fonts'
import { formatMoney } from '@/lib/currency-totals'
import { formatDateOnly } from '@/lib/date-utils'

// Styles take the agency's brand colour (Settings → Organization); they were
// a fixed blue (B2C) / purple (B2B) whatever the agency's colours.
const makeStyles = ({ main, light }: { main: string; light: string }) => StyleSheet.create({
  page: {
    padding: 40,
    // Room for the letterhead footer on every page (QuoteLetterhead).
    paddingBottom: QUOTE_FOOTER_SPACE,
    fontSize: 10,
    fontFamily: QUOTE_PDF_FONT,
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 30,
    borderBottom: `2 solid ${main}`,
    paddingBottom: 15,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: main,
    marginBottom: 5,
  },
  companyInfo: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 2,
  },
  quoteNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 10,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    borderBottom: '1 solid #e5e7eb',
    paddingBottom: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  label: {
    width: '40%',
    fontSize: 9,
    color: '#6b7280',
  },
  value: {
    width: '60%',
    fontSize: 9,
    color: '#1f2937',
    fontWeight: 'bold',
  },
  table: {
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 8,
  },
  tableHeader: {
    backgroundColor: '#f3f4f6',
    borderBottom: `2 solid ${main}`,
    paddingVertical: 8,
  },
  tableCell: {
    fontSize: 9,
    paddingHorizontal: 5,
  },
  tableCellHeader: {
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 5,
    color: '#1f2937',
  },
  col60: {
    width: '60%',
  },
  col40: {
    width: '40%',
  },
  totalRow: {
    flexDirection: 'row',
    marginTop: 10,
    padding: 10,
    backgroundColor: light,
    borderRadius: 5,
  },
  totalLabel: {
    width: '60%',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  totalValue: {
    width: '40%',
    fontSize: 14,
    fontWeight: 'bold',
    color: main,
    textAlign: 'right',
  },
  perPersonRow: {
    flexDirection: 'row',
    marginTop: 5,
    padding: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 5,
  },
  perPersonLabel: {
    width: '60%',
    fontSize: 10,
    color: '#6b7280',
  },
  perPersonValue: {
    width: '40%',
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'right',
  },
  notes: {
    marginTop: 10,
    padding: 10,
    backgroundColor: light,
    borderLeft: `3 solid ${main}`,
    borderRadius: 3,
  },
  notesText: {
    fontSize: 9,
    color: '#1f2937',
    lineHeight: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 8,
    borderTop: '1 solid #e5e7eb',
    paddingTop: 10,
  },
})

interface B2CQuotePDFProps {
  /** The agency (Settings → Organization), logo as a data: URL. */
  company?: CompanyIdentity
  quote: {
    quote_number: string
    num_travelers: number
    tier: string
    selling_price: number
    price_per_person: number
    total_cost: number
    margin_percent: number
    currency: string
    cost_breakdown: Record<string, number>
    valid_until: string | null
    created_at: string
    client_notes: string | null
    clients: {
      full_name: string
      email: string
      phone: string
      nationality: string
    } | null
    itineraries: {
      itinerary_code: string
      trip_name: string
      start_date: string
      end_date: string
      total_days: number
    } | null
  }
}

const B2CQuotePDF: React.FC<B2CQuotePDFProps> = ({ quote, company = { name: '' } }) => {
  const styles = makeStyles(quotePalette(company))
  // The categories the price covers, by name only.
  const includedLabels = Object.entries(quote.cost_breakdown || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([key]) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
  const money = (n: unknown) => formatMoney(n, quote.currency)
  // Calendar dates as dates: toLocaleDateString() with no locale printed
  // "11/8/2026" on the server, and a UTC parse moves a date-only value.
  const day = (d: string | null | undefined) => formatDateOnly(d, 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Footer on every page — declared first, so it repeats from page 1 */}
        <QuoteFooter company={company} />
        {/* Header */}
        <QuoteHeader
          company={company}
          title="Quotation"
          number={quote.quote_number}
          date={`Issued ${new Date(quote.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        />

        {/* Client Information */}
        {quote.clients && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Client Information</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Name:</Text>
              <Text style={styles.value}>{quote.clients.full_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>{quote.clients.email || 'Not provided'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Phone:</Text>
              <Text style={styles.value}>{quote.clients.phone || 'Not provided'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Nationality:</Text>
              <Text style={styles.value}>{quote.clients.nationality || 'Not specified'}</Text>
            </View>
          </View>
        )}

        {/* Trip Information */}
        {quote.itineraries && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trip Details</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Trip Name:</Text>
              <Text style={styles.value}>{quote.itineraries.trip_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Duration:</Text>
              <Text style={styles.value}>{quote.itineraries.total_days} days</Text>
            </View>
            {/* A trip with no dates yet: no row, never 1/1/1970. */}
            {quote.itineraries.start_date && (
              <View style={styles.row}>
                <Text style={styles.label}>Start Date:</Text>
                <Text style={styles.value}>{day(quote.itineraries.start_date)}</Text>
              </View>
            )}
            {quote.itineraries.end_date && (
              <View style={styles.row}>
                <Text style={styles.label}>End Date:</Text>
                <Text style={styles.value}>{day(quote.itineraries.end_date)}</Text>
              </View>
            )}
            <View style={styles.row}>
              <Text style={styles.label}>Travelers:</Text>
              <Text style={styles.value}>{quote.num_travelers} person{quote.num_travelers > 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Service Level:</Text>
              <Text style={styles.value}>{quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}</Text>
            </View>
          </View>
        )}

        {/* Price. The client's copy: what is included, and the price — never
            the operator's cost per category. This table listed the net
            supplier sums (cost_breakdown), which add up to total_cost, right
            above the selling price: the margin, worked out for the client. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price</Text>

          {includedLabels.length > 0 && (
            <View style={styles.row}>
              <Text style={styles.label}>Includes:</Text>
              <Text style={styles.value}>{includedLabels.join(', ')}</Text>
            </View>
          )}

          {/* Total Price */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Price</Text>
            <Text style={styles.totalValue}>
              {money(quote.selling_price)}
            </Text>
          </View>

          {/* Per Person Price */}
          <View style={styles.perPersonRow}>
            <Text style={styles.perPersonLabel}>
              Price per person ({quote.num_travelers} traveler{quote.num_travelers > 1 ? 's' : ''})
            </Text>
            <Text style={styles.perPersonValue}>
              {money(quote.price_per_person)}
            </Text>
          </View>
        </View>

        {/* Client Notes */}
        {quote.client_notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Information</Text>
            <View style={styles.notes}>
              <Text style={styles.notesText}>{quote.client_notes}</Text>
            </View>
          </View>
        )}

        {/* Quote Validity — kept on one page with its heading */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Quote Validity</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Quote Date:</Text>
            <Text style={styles.value}>{day(quote.created_at)}</Text>
          </View>
          {quote.valid_until && (
            <View style={styles.row}>
              <Text style={styles.label}>Valid Until:</Text>
              <Text style={styles.value}>{day(quote.valid_until)}</Text>
            </View>
          )}
        </View>

      </Page>
    </Document>
  )
}

export default B2CQuotePDF
