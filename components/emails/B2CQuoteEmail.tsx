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

interface B2CQuoteEmailProps {
  clientName: string
  quoteNumber: string
  tripName: string
  startDate: string
  duration: number
  numTravelers: number
  pricePerPerson: number
  totalPrice: number
  currency: string
  validUntil?: string
  clientNotes?: string
  viewQuoteUrl: string
}

export default function B2CQuoteEmail({
  clientName,
  quoteNumber,
  tripName,
  startDate,
  duration,
  numTravelers,
  pricePerPerson,
  totalPrice,
  currency,
  validUntil,
  clientNotes,
  viewQuoteUrl,
}: B2CQuoteEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={companyName}>AUTOURA</Heading>
            <Text style={tagline}>Your Journey, Perfectly Planned</Text>
          </Section>

          {/* Greeting */}
          <Section style={content}>
            <Heading style={h1}>Your Egypt Travel Quote is Ready!</Heading>
            <Text style={text}>Dear {clientName},</Text>
            <Text style={text}>
              Thank you for your interest in exploring Egypt with us. We're excited to present your personalized travel quote.
            </Text>
          </Section>

          {/* Quote Summary */}
          <Section style={quoteBox}>
            <Row>
              <Column>
                <Text style={label}>Quote Number</Text>
                <Text style={value}>{quoteNumber}</Text>
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
              <Column>
                <Text style={label}>Start Date</Text>
                <Text style={value}>{new Date(startDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</Text>
              </Column>
              <Column>
                <Text style={label}>Duration</Text>
                <Text style={value}>{duration} days</Text>
              </Column>
            </Row>

            <Row>
              <Column>
                <Text style={label}>Travelers</Text>
                <Text style={value}>{numTravelers} {numTravelers === 1 ? 'person' : 'people'}</Text>
              </Column>
            </Row>

            <Hr style={divider} />

            {/* Pricing */}
            <Row>
              <Column>
                <Text style={label}>Price Per Person</Text>
                <Text style={priceText}>{currency} {pricePerPerson.toLocaleString()}</Text>
              </Column>
            </Row>

            <Row>
              <Column>
                <Text style={label}>Total Price</Text>
                <Text style={totalPriceText}>{currency} {totalPrice.toLocaleString()}</Text>
              </Column>
            </Row>

            {validUntil && (
              <>
                <Hr style={divider} />
                <Text style={validityText}>
                  This quote is valid until {new Date(validUntil).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </Text>
              </>
            )}
          </Section>

          {/* Client Notes */}
          {clientNotes && (
            <Section style={notesSection}>
              <Text style={notesLabel}>Special Notes:</Text>
              <Text style={notesText}>{clientNotes}</Text>
            </Section>
          )}

          {/* CTA Button */}
          <Section style={buttonSection}>
            <Button style={button} href={viewQuoteUrl}>
              View Full Quote Details
            </Button>
          </Section>

          {/* Next Steps */}
          <Section style={content}>
            <Heading style={h2}>What's Next?</Heading>
            <Text style={text}>
              • Review your detailed itinerary and pricing breakdown
            </Text>
            <Text style={text}>
              • Ask us any questions - we're here to help!
            </Text>
            <Text style={text}>
              • Ready to book? Let us know and we'll get started
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Hr style={divider} />
            <Text style={footerText}>
              Need assistance? Reply to this email or contact us at:
            </Text>
            <Text style={footerText}>
              📧 info@autoura.com | 📱 +20 123 456 7890
            </Text>
            <Text style={footerTextSmall}>
              © 2026 Autoura. All rights reserved.
            </Text>
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
  backgroundColor: '#3b82f6',
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
  color: '#e0e7ff',
  fontSize: '14px',
  margin: '0',
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
  fontSize: '20px',
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

const priceText = {
  color: '#3b82f6',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 15px 0',
}

const totalPriceText = {
  color: '#1f2937',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '0',
}

const divider = {
  borderColor: '#e5e7eb',
  margin: '15px 0',
}

const validityText = {
  color: '#f59e0b',
  fontSize: '14px',
  fontWeight: '600',
  margin: '10px 0 0 0',
  textAlign: 'center' as const,
}

const notesSection = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '8px',
  padding: '15px 20px',
  margin: '0 20px 20px 20px',
}

const notesLabel = {
  color: '#1e40af',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 8px 0',
}

const notesText = {
  color: '#1e3a8a',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}

const buttonSection = {
  padding: '0 20px 30px 20px',
  textAlign: 'center' as const,
}

const button = {
  backgroundColor: '#3b82f6',
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
