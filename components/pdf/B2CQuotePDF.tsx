import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 30,
    borderBottom: '2 solid #3b82f6',
    paddingBottom: 15,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3b82f6',
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
    borderBottom: '2 solid #3b82f6',
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
    backgroundColor: '#eff6ff',
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
    color: '#3b82f6',
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
    backgroundColor: '#f0f9ff',
    borderLeft: '3 solid #3b82f6',
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

const B2CQuotePDF: React.FC<B2CQuotePDFProps> = ({ quote }) => {
  const costBreakdownEntries = Object.entries(quote.cost_breakdown || {}).filter(([_, value]) => value > 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>AUTOURA</Text>
          <Text style={styles.companyInfo}>Travel2Egypt - Your Journey, Our Passion</Text>
          <Text style={styles.companyInfo}>info@travel2egypt.com | +20 115 801 1600</Text>
          <Text style={styles.quoteNumber}>Quote #{quote.quote_number}</Text>
        </View>

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
            <View style={styles.row}>
              <Text style={styles.label}>Start Date:</Text>
              <Text style={styles.value}>{new Date(quote.itineraries.start_date).toLocaleDateString()}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>End Date:</Text>
              <Text style={styles.value}>{new Date(quote.itineraries.end_date).toLocaleDateString()}</Text>
            </View>
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

        {/* Pricing Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing Breakdown</Text>

          {/* Cost Items Table */}
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCellHeader, styles.col60]}>Item</Text>
              <Text style={[styles.tableCellHeader, styles.col40]}>Amount</Text>
            </View>

            {costBreakdownEntries.map(([key, value]) => (
              <View key={key} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.col60]}>
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
                <Text style={[styles.tableCell, styles.col40]}>
                  {quote.currency} {value.toLocaleString()}
                </Text>
              </View>
            ))}
          </View>

          {/* Total Price */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Price</Text>
            <Text style={styles.totalValue}>
              {quote.currency} {quote.selling_price.toLocaleString()}
            </Text>
          </View>

          {/* Per Person Price */}
          <View style={styles.perPersonRow}>
            <Text style={styles.perPersonLabel}>
              Price per person ({quote.num_travelers} traveler{quote.num_travelers > 1 ? 's' : ''})
            </Text>
            <Text style={styles.perPersonValue}>
              {quote.currency} {quote.price_per_person.toLocaleString()}
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

        {/* Quote Validity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quote Validity</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Quote Date:</Text>
            <Text style={styles.value}>{new Date(quote.created_at).toLocaleDateString()}</Text>
          </View>
          {quote.valid_until && (
            <View style={styles.row}>
              <Text style={styles.label}>Valid Until:</Text>
              <Text style={styles.value}>{new Date(quote.valid_until).toLocaleDateString()}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>This quote is generated by Autoura - Travel Operations Management System</Text>
          <Text>Thank you for choosing Travel2Egypt</Text>
        </View>
      </Page>
    </Document>
  )
}

export default B2CQuotePDF
