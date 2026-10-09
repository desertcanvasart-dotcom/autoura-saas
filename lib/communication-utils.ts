// Email and WhatsApp integration utilities

import { escapeHtml } from '@/lib/html-escape'

// The signer of client emails. Was a hardcoded person at one company —
// every tenant's itinerary emails were signed "Islam Mohamed, Travel2Egypt".
// Callers pass the tenant's identity; blanks render nothing.
export interface EmailSignerInfo {
  name?: string
  company?: string
  email?: string
  phone?: string
  website?: string
}

export function generateEmailTemplate(
  clientName: string,
  itineraryCode: string,
  tripName: string,
  /** Already formatted for its currency ("$3,000.00", "¥450,000"). */
  totalPrice: string,
  signer: EmailSignerInfo = {},
  /** Settings → Organization → deposit; omitted = no deposit sentence. */
  depositPercent?: number | null
): string {
  // Every value is the operator's or the client's text: escaped. The template
  // named one company's destination and brand for every tenant ("Your Egypt
  // Adventure Awaits!", "A 30% deposit secures your adventure!",
  // "© Travel2Egypt.org") and printed the client's name as raw HTML.
  const e = escapeHtml
  const company = signer.company?.trim() || ''
  const deposit = typeof depositPercent === 'number' && Number.isFinite(depositPercent) && depositPercent > 0
    ? `A ${depositPercent}% deposit confirms your booking.`
    : ''
  return `
<html>
<head>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    .header {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .content {
      padding: 30px;
      background: #ffffff;
    }
    .highlight {
      background: #eff6ff;
      padding: 20px;
      border-left: 4px solid #2563eb;
      margin: 20px 0;
      border-radius: 4px;
    }
    .signature {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
    }
    .footer {
      background: #f9fafb;
      padding: 25px;
      text-align: center;
      border-radius: 0 0 8px 8px;
      border-top: 2px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">Your itinerary${company ? ` from ${e(company)}` : ''}</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">Itinerary &amp; quote</p>
  </div>

  <div class="content">
    <p>Dear <strong>${e(clientName)}</strong>,</p>

    <p>Thank you for your interest. We're pleased to send you your personalised itinerary.</p>

    <div class="highlight">
      <h3 style="margin-top: 0; color: #2563eb;">Your trip</h3>
      <p><strong>Quote reference:</strong> ${e(itineraryCode)}</p>
      <p><strong>Tour:</strong> ${e(tripName)}</p>
      <p><strong>Total:</strong> ${e(totalPrice)}</p>
    </div>

    <p>Your itinerary is attached as a PDF, with the day-by-day programme and the price.</p>

    <p><strong>Ready to book?</strong> Reply to this email or contact us and we'll take care of the rest.${deposit ? ` ${deposit}` : ''}</p>

    <div class="signature">
      ${company ? `<p style="margin: 5px 0;"><strong>${e(company)}</strong></p>` : ''}
      ${signer.email ? `<p style="margin: 5px 0;">✉️ ${e(signer.email)}</p>` : ''}
      ${signer.phone ? `<p style="margin: 5px 0;">📞 ${e(signer.phone)}</p>` : ''}
      ${signer.website ? `<p style="margin: 5px 0;">🌍 ${e(signer.website)}</p>` : ''}
    </div>
  </div>

  ${company ? `<div class="footer">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} ${e(company)}</p>
  </div>` : ''}
</body>
</html>
  `.trim()
}

export function generateWhatsAppMessage(
  signer: EmailSignerInfo,
  clientName: string,
  tripName: string,
  /** Already formatted for its currency. */
  totalPrice: string
): string {
  // It promised "Everything is included: professional guide, transportation,
  // entrance fees…" whatever the trip held, and an "Egypt adventure".
  return `Hi ${clientName}! 👋

Thank you for your interest in ${tripName}!

I've prepared your itinerary with the day-by-day programme and the price.

💰 Total: ${totalPrice}

The itinerary PDF has been sent to your email.

Ready to confirm? Just reply here${signer.phone ? ` or call ${signer.phone} 📞` : ''}

Best regards,
${signer.company || ''}`
}

export function generateWhatsAppLink(phoneNumber: string, message: string): string {
  const cleanPhone = phoneNumber.replace(/\D/g, '')
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`
}

/** Dialling codes for the countries operators run trips in (Settings → operating country). */
const DIAL_CODES: Record<string, string> = {
  egypt: '20', morocco: '212', jordan: '962', tunisia: '216', turkey: '90', türkiye: '90',
  greece: '30', 'united arab emirates': '971', uae: '971', japan: '81', italy: '39',
  spain: '34', france: '33', portugal: '351', 'united kingdom': '44', uk: '44',
}

/** The dialling code of a country name, or null when unknown. */
export function dialCodeForCountry(country: string | null | undefined): string | null {
  return DIAL_CODES[String(country ?? '').trim().toLowerCase()] ?? null
}

/**
 * A phone number as wa.me wants it: digits with the country code, no "+".
 * A local number (leading trunk 0) takes the agency's own country code. It
 * used to take Egypt's whatever the agency — and any 11-digit number starting
 * with 1 was made Egyptian too, which turned every US/Canadian "1 415 555 1234"
 * into a wrong recipient. A number already in international form is kept.
 */
export function formatPhoneForWhatsApp(phone: string, operatingCountry?: string | null): string {
  let cleaned = phone.replace(/[\s\-().]/g, '')
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2)
  if (!cleaned.startsWith('+') && cleaned.startsWith('0')) {
    const code = dialCodeForCountry(operatingCountry)
    if (code) cleaned = '+' + code + cleaned.substring(1)
  }
  return cleaned.replace(/^\+/, '')
}
