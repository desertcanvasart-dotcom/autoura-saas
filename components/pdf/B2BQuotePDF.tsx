import React from 'react'
import type { CompanyIdentity } from '@/lib/company-identity'
import { QuoteHeader, QuoteFooter, quotePalette, QuoteTopBar, QUOTE_FOOTER_SPACE } from './QuoteLetterhead'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { QUOTE_PDF_FONT } from '@/lib/pdf/quote-fonts'

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
    marginBottom: 25,
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
    marginBottom: 18,
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
    width: '35%',
    fontSize: 9,
    color: '#6b7280',
  },
  value: {
    width: '65%',
    fontSize: 9,
    color: '#1f2937',
    fontWeight: 'bold',
  },
  pricingTableTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: main,
    marginBottom: 10,
    textAlign: 'center',
    backgroundColor: light,
    padding: 8,
    borderRadius: 5,
  },
  pricingTable: {
    marginTop: 10,
    marginBottom: 15,
  },
  pricingTableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 6,
  },
  pricingTableHeader: {
    backgroundColor: main,
    borderBottom: `2 solid ${main}`,
    paddingVertical: 8,
  },
  pricingTableCell: {
    fontSize: 9,
    paddingHorizontal: 5,
    textAlign: 'center',
  },
  pricingTableCellHeader: {
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 5,
    color: '#ffffff',
    textAlign: 'center',
  },
  col33: {
    width: '33.33%',
  },
  costBreakdownRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottom: '1 solid #f3f4f6',
  },
  costLabel: {
    width: '70%',
    fontSize: 9,
    color: '#6b7280',
  },
  costValue: {
    width: '30%',
    fontSize: 9,
    color: '#1f2937',
    fontWeight: 'bold',
    textAlign: 'right',
  },
  highlight: {
    backgroundColor: '#fef3c7',
    padding: 8,
    borderRadius: 5,
    marginTop: 5,
  },
  highlightText: {
    fontSize: 9,
    color: '#92400e',
  },
  notes: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderLeft: `3 solid ${main}`,
    borderRadius: 3,
  },
  notesText: {
    fontSize: 8,
    color: '#1f2937',
    lineHeight: 1.4,
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
  grid2: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCol: {
    flex: 1,
  },
})

interface B2BQuotePDFProps {
  /** The agency (Settings → Organization), logo as a data: URL. */
  company?: CompanyIdentity
  quote: {
    quote_number: string
    tier: string
    tour_leader_included: boolean
    currency: string
    ppd_accommodation: number
    ppd_cruise: number
    single_supplement: number
    fixed_transport: number
    fixed_guide: number
    fixed_other: number
    pp_entrance_fees: number
    pp_meals: number
    pp_tips: number
    pp_domestic_flights: number
    pricing_table: Record<string, { pp: number; total: number }>
    tour_leader_cost: number
    valid_from: string | null
    valid_until: string | null
    season: string | null
    created_at: string
    terms_and_conditions: string | null
    b2b_partners: {
      company_name: string
      partner_code: string
      contact_name: string
      email: string
      country: string
    } | null
    itineraries: {
      itinerary_code: string
      trip_name: string
      start_date: string
      total_days: number
    } | null
  }
}

const B2BQuotePDF: React.FC<B2BQuotePDFProps> = ({ quote, company = { name: '' } }) => {
  const styles = makeStyles(quotePalette(company))
  // Sort pax counts
  const sortedPax = Object.keys(quote.pricing_table)
    .map(Number)
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b)

  // Split into chunks of 10 for better display
  const paxChunks: number[][] = []
  for (let i = 0; i < sortedPax.length; i += 10) {
    paxChunks.push(sortedPax.slice(i, i + 10))
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Footer on every page — declared first, so it repeats from the first */}
        <QuoteFooter company={company} />
        {/* Header */}
        <QuoteHeader
          company={company}
          title="B2B Rate Sheet"
          number={quote.quote_number}
          date={`Issued ${new Date(quote.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        />

        {/* Partner Information */}
        {quote.b2b_partners && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Partner Information</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Company:</Text>
              <Text style={styles.value}>{quote.b2b_partners.company_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Partner Code:</Text>
              <Text style={styles.value}>{quote.b2b_partners.partner_code}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Contact:</Text>
              <Text style={styles.value}>{quote.b2b_partners.contact_name || 'Not specified'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>{quote.b2b_partners.email}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Country:</Text>
              <Text style={styles.value}>{quote.b2b_partners.country}</Text>
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
                <Text style={styles.value}>{new Date(quote.itineraries.start_date).toLocaleDateString()}</Text>
              </View>
            )}
            <View style={styles.row}>
              <Text style={styles.label}>Service Tier:</Text>
              <Text style={styles.value}>{quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}</Text>
            </View>
            {quote.season && (
              <View style={styles.row}>
                <Text style={styles.label}>Season:</Text>
                <Text style={styles.value}>{quote.season}</Text>
              </View>
            )}
          </View>
        )}

        {/* Multi-Pax Pricing Table */}
        <View style={styles.section}>
          <Text style={styles.pricingTableTitle}>
            MULTI-PAX PRICING TABLE {quote.tour_leader_included ? '(Tour Leader +1 Included)' : ''}
          </Text>

          {paxChunks.map((chunk, chunkIdx) => (
            <View key={chunkIdx} style={styles.pricingTable}>
              {/* Table Header */}
              <View style={[styles.pricingTableRow, styles.pricingTableHeader]}>
                <Text style={[styles.pricingTableCellHeader, styles.col33]}>PAX</Text>
                <Text style={[styles.pricingTableCellHeader, styles.col33]}>Per Person</Text>
                <Text style={[styles.pricingTableCellHeader, styles.col33]}>Total</Text>
              </View>

              {/* Table Rows */}
              {chunk.map(pax => {
                const pricing = quote.pricing_table[pax]
                return (
                  <View key={pax} style={styles.pricingTableRow}>
                    <Text style={[styles.pricingTableCell, styles.col33]}>
                      {pax} {quote.tour_leader_included ? `(+1 = ${pax + 1})` : ''}
                    </Text>
                    <Text style={[styles.pricingTableCell, styles.col33]}>
                      {quote.currency} {pricing.pp.toLocaleString()}
                    </Text>
                    <Text style={[styles.pricingTableCell, styles.col33]}>
                      {quote.currency} {pricing.total.toLocaleString()}
                    </Text>
                  </View>
                )
              })}
            </View>
          ))}

          {quote.tour_leader_included && (
            <View style={styles.highlight}>
              <Text style={styles.highlightText}>
                ⚠ Tour Leader +1 included: All prices include one complimentary tour leader. Cost distributed across paying passengers.
              </Text>
            </View>
          )}
        </View>
      </Page>

      {/* Page 2: Cost Breakdown */}
      <Page size="A4" style={styles.page}>
        {/* Footer on every page — declared first, so it repeats from the first */}
        <QuoteFooter company={company} />
        <QuoteTopBar company={company} />
        {/* Cost Breakdown Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cost Breakdown</Text>

          {/* PPD Costs */}
          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>Per Person Double (PPD)</Text>
            {quote.ppd_accommodation > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Accommodation (per night)</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.ppd_accommodation.toLocaleString()}</Text>
              </View>
            )}
            {quote.ppd_cruise > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Cruise (per night)</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.ppd_cruise.toLocaleString()}</Text>
              </View>
            )}
            {quote.single_supplement > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Single Supplement (total)</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.single_supplement.toLocaleString()}</Text>
              </View>
            )}
          </View>

          {/* Fixed Costs */}
          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>Fixed Costs (Per Trip)</Text>
            {quote.fixed_transport > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Transportation</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.fixed_transport.toLocaleString()}</Text>
              </View>
            )}
            {quote.fixed_guide > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Guide</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.fixed_guide.toLocaleString()}</Text>
              </View>
            )}
            {quote.fixed_other > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Other Fixed Costs</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.fixed_other.toLocaleString()}</Text>
              </View>
            )}
          </View>

          {/* Per Person Costs */}
          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>Per Person Costs</Text>
            {quote.pp_entrance_fees > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Entrance Fees</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.pp_entrance_fees.toLocaleString()}</Text>
              </View>
            )}
            {quote.pp_meals > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Meals</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.pp_meals.toLocaleString()}</Text>
              </View>
            )}
            {quote.pp_tips > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Tips</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.pp_tips.toLocaleString()}</Text>
              </View>
            )}
            {quote.pp_domestic_flights > 0 && (
              <View style={styles.costBreakdownRow}>
                <Text style={styles.costLabel}>Domestic Flights</Text>
                <Text style={styles.costValue}>{quote.currency} {quote.pp_domestic_flights.toLocaleString()}</Text>
              </View>
            )}
          </View>

          {/* Tour Leader Cost */}
          {quote.tour_leader_included && quote.tour_leader_cost > 0 && (
            <View style={styles.highlight}>
              <Text style={styles.highlightText}>
                Tour Leader Total Cost: {quote.currency} {quote.tour_leader_cost.toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        {/* Validity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Validity</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Quote Date:</Text>
            <Text style={styles.value}>{new Date(quote.created_at).toLocaleDateString()}</Text>
          </View>
          {quote.valid_from && (
            <View style={styles.row}>
              <Text style={styles.label}>Valid From:</Text>
              <Text style={styles.value}>{new Date(quote.valid_from).toLocaleDateString()}</Text>
            </View>
          )}
          {quote.valid_until && (
            <View style={styles.row}>
              <Text style={styles.label}>Valid Until:</Text>
              <Text style={styles.value}>{new Date(quote.valid_until).toLocaleDateString()}</Text>
            </View>
          )}
        </View>

        {/* Terms & Conditions */}
        {quote.terms_and_conditions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            <View style={styles.notes}>
              <Text style={styles.notesText}>{quote.terms_and_conditions}</Text>
            </View>
          </View>
        )}

      </Page>
    </Document>
  )
}

export default B2BQuotePDF
