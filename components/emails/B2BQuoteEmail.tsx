import { formatMoney } from '@/lib/currency-totals'
import React from 'react'
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Row,
  Column,
  Button,
} from '@react-email/components'
import { contactLine, emailDate, type QuoteEmailCompany } from './quote-email-company'

interface B2BQuoteEmailProps {
  partnerName: string
  contactName?: string
  quoteNumber: string
  tripName: string
  /** Null when the trip has no dates yet: the row is left out. */
  startDate: string | null
  duration: number
  tier: string
  tourLeaderIncluded: boolean
  pricingTable: Record<string, { pp: number; total: number }>
  currency: string
  validFrom?: string
  validUntil?: string
  season?: string
  /** A page the recipient can open without an account. None exists yet:
   *  the quote is the attached PDF, and the button is left out. */
  viewQuoteUrl?: string
  /** The tenant sending it (Settings → Organization). */
  company?: QuoteEmailCompany
}

export default function B2BQuoteEmail({
  partnerName,
  contactName,
  quoteNumber,
  tripName,
  startDate,
  duration,
  tier,
  tourLeaderIncluded,
  pricingTable,
  currency,
  validFrom,
  validUntil,
  season,
  viewQuoteUrl,
  company,
}: B2BQuoteEmailProps) {
  const start = emailDate(startDate, { year: 'numeric', month: 'long', day: 'numeric' })
  const contact = contactLine(company)
  // Get pax range
  const paxCounts = Object.keys(pricingTable).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b)
  const minPax = paxCounts[0]
  const maxPax = paxCounts[paxCounts.length - 1]
  const lowestPP = pricingTable[maxPax]?.pp || 0

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            {company?.name && <Heading style={companyName}>{company.name}</Heading>}
            <Text style={tagline}>B2B Rate Sheet</Text>
          </Section>

          {/* Greeting */}
          <Section style={content}>
            <Heading style={h1}>New Rate Sheet Available</Heading>
            <Text style={text}>
              Dear {contactName || partnerName},
            </Text>
            <Text style={text}>
              Please find below your customized B2B rate sheet for the requested itinerary.
            </Text>
          </Section>

          {/* Quote Summary */}
          <Section style={quoteBox}>
            <Row>
              <Column>
                <Text style={label}>Quote Number</Text>
                <Text style={value}>{quoteNumber}</Text>
              </Column>
              <Column align="right">
                <Text style={label}>Partner</Text>
                <Text style={value}>{partnerName}</Text>
              </Column>
            </Row>
            <Hr style={divider} />

            <Row>
              <Column>
                <Text style={label}>Trip</Text>
                <Text style={value}>{tripName}</Text>
              </Column>
            </Row>

            <Row>
              {start && (
                <Column>
                  <Text style={label}>Start Date</Text>
                  <Text style={value}>{start}</Text>
                </Column>
              )}
              <Column>
                <Text style={label}>Duration</Text>
                <Text style={value}>{duration} days</Text>
              </Column>
            </Row>

            <Row>
              <Column>
                <Text style={label}>Service Tier</Text>
                <Text style={tierBadge}>
                  {tier.toUpperCase()}
                </Text>
              </Column>
              <Column>
                <Text style={label}>Tour Leader</Text>
                <Text style={value}>
                  {tourLeaderIncluded ? '✓ Included (+1)' : '✗ Not Included'}
                </Text>
              </Column>
            </Row>

            {season && (
              <Row>
                <Column>
                  <Text style={label}>Season</Text>
                  <Text style={value}>{season}</Text>
                </Column>
              </Row>
            )}
          </Section>

          {/* Pricing Highlight */}
          <Section style={pricingHighlight}>
            <Row>
              <Column>
                <Text style={highlightLabel}>Pax Range</Text>
                <Text style={highlightValue}>{minPax} - {maxPax} pax</Text>
              </Column>
              <Column align="right">
                <Text style={highlightLabel}>Best Rate (Per Person)</Text>
                <Text style={highlightValueLarge}>{formatMoney(lowestPP, currency)}</Text>
                <Text style={highlightSubtext}>at {maxPax} pax</Text>
              </Column>
            </Row>
          </Section>

          {/* Pricing Table Preview */}
          <Section style={tableSection}>
            <Heading style={h2}>Multi-Pax Pricing Table</Heading>
            <Text style={tableNote}>
              {tourLeaderIncluded && '* Tour Leader (+1) cost included in all prices'}
            </Text>

            {/* Show first 5 and last 1 for preview */}
            {paxCounts.slice(0, 5).map((pax) => {
              const pricing = pricingTable[pax]
              return (
                <Row key={pax} style={tableRow}>
                  <Column style={tableCell}>
                    <Text style={tableCellText}>{pax} pax</Text>
                  </Column>
                  <Column style={tableCell} align="right">
                    <Text style={tableCellText}>{formatMoney(pricing.pp, currency)} pp</Text>
                  </Column>
                  <Column style={tableCell} align="right">
                    <Text style={tableCellTextBold}>{formatMoney(pricing.total, currency)}</Text>
                  </Column>
                </Row>
              )
            })}

            {paxCounts.length > 6 && (
              <Row style={tableRow}>
                <Column style={tableCell} colSpan={3}>
                  <Text style={tableCellText}>... see full pricing table in quote ...</Text>
                </Column>
              </Row>
            )}

            {paxCounts.length > 5 && (
              <Row key={maxPax} style={{...tableRow, ...tableRowHighlight}}>
                <Column style={tableCell}>
                  <Text style={tableCellTextBold}>{maxPax} pax</Text>
                </Column>
                <Column style={tableCell} align="right">
                  <Text style={tableCellTextBold}>{formatMoney(pricingTable[maxPax].pp, currency)} pp</Text>
                </Column>
                <Column style={tableCell} align="right">
                  <Text style={tableCellTextBold}>{formatMoney(pricingTable[maxPax].total, currency)}</Text>
                </Column>
              </Row>
            )}
          </Section>

          {/* Validity */}
          {(validFrom || validUntil) && (
            <Section style={validitySection}>
              <Text style={validityLabel}>Rate Validity</Text>
              <Text style={validityText}>
                {validFrom && `From ${new Date(validFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                {validFrom && validUntil && ' - '}
                {validUntil && `Until ${new Date(validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </Text>
            </Section>
          )}

          {/* CTA Button — only to a page the recipient can open. It linked the
              staff quote page, which sent every client and partner to /login. */}
          {viewQuoteUrl && (
            <Section style={buttonSection}>
              <Button style={button} href={viewQuoteUrl}>
                View Complete Rate Sheet
              </Button>
            </Section>
          )}

          {/* Footer */}
          <Section style={footer}>
            <Hr style={divider} />
            <Text style={footerText}>
              Questions about this rate sheet? Contact your account manager or reply to this email.
            </Text>
            {contact && <Text style={footerText}>{contact}</Text>}
            {company?.name && (
              <Text style={footerTextSmall}>
                © {new Date().getFullYear()} {company.name}
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0',
  maxWidth: '600px',
}

const header = {
  backgroundColor: '#7c3aed',
  padding: '30px 20px',
  textAlign: 'center' as const,
}

const companyName = {
  color: '#ffffff',
  fontSize: '32px',
  fontWeight: 'bold',
  margin: '0 0 5px 0',
  letterSpacing: '2px',
}

const tagline = {
  color: '#e9d5ff',
  fontSize: '14px',
  margin: '0',
  fontWeight: '600',
}

const content = {
  padding: '30px 20px',
}

const h1 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0 0 20px 0',
}

const h2 = {
  color: '#1f2937',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0 0 15px 0',
}

const text = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 10px 0',
}

const quoteBox = {
  backgroundColor: '#f9fafb',
  border: '2px solid #e5e7eb',
  borderRadius: '8px',
  padding: '20px',
  margin: '0 20px 20px 20px',
}

const label = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 5px 0',
}

const value = {
  color: '#1f2937',
  fontSize: '16px',
  fontWeight: '500',
  margin: '0 0 15px 0',
}

const tierBadge = {
  color: '#7c3aed',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 15px 0',
  textTransform: 'uppercase' as const,
}

const divider = {
  borderColor: '#e5e7eb',
  margin: '15px 0',
}

const pricingHighlight = {
  backgroundColor: '#f0fdf4',
  border: '2px solid #86efac',
  borderRadius: '8px',
  padding: '20px',
  margin: '0 20px 20px 20px',
}

const highlightLabel = {
  color: '#15803d',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 5px 0',
}

const highlightValue = {
  color: '#166534',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0',
}

const highlightValueLarge = {
  color: '#166534',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0',
}

const highlightSubtext = {
  color: '#15803d',
  fontSize: '12px',
  margin: '5px 0 0 0',
}

const tableSection = {
  padding: '0 20px 20px 20px',
}

const tableNote = {
  color: '#f59e0b',
  fontSize: '13px',
  fontStyle: 'italic',
  margin: '0 0 15px 0',
}

const tableRow = {
  borderBottom: '1px solid #e5e7eb',
  padding: '10px 0',
}

const tableRowHighlight = {
  backgroundColor: '#f0fdf4',
}

const tableCell = {
  padding: '8px',
}

const tableCellText = {
  color: '#4b5563',
  fontSize: '14px',
  margin: '0',
}

const tableCellTextBold = {
  color: '#1f2937',
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '0',
}

const validitySection = {
  backgroundColor: '#fef3c7',
  border: '1px solid #fcd34d',
  borderRadius: '8px',
  padding: '15px 20px',
  margin: '0 20px 20px 20px',
  textAlign: 'center' as const,
}

const validityLabel = {
  color: '#92400e',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  margin: '0 0 5px 0',
}

const validityText = {
  color: '#78350f',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
}

const buttonSection = {
  padding: '0 20px 30px 20px',
  textAlign: 'center' as const,
}

const button = {
  backgroundColor: '#7c3aed',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 40px',
  cursor: 'pointer',
}

const footer = {
  padding: '20px',
}

const footerText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  margin: '5px 0',
}

const footerTextSmall = {
  color: '#9ca3af',
  fontSize: '12px',
  textAlign: 'center' as const,
  margin: '15px 0 0 0',
}
