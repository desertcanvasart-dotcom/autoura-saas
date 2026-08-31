import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml, safeUrl } from '@/lib/html-escape'
import puppeteer from 'puppeteer'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { fetchLogoBytes } from '@/lib/company-identity'

interface Itinerary {
  itinerary_code: string
  client_name: string
  client_email: string
  client_phone?: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  currency: string
  total_cost: number
  status: string
  notes?: string
}

interface Day {
  day_number: number
  date: string
  city: string
  title: string
  description: string
  overnight_city: string
  services: Service[]
}

interface Service {
  service_type: string
  service_name: string
  quantity: number
  total_cost: number
  notes?: string
}

// Clean service name helper
function cleanServiceName(name: string, serviceType?: string): string {
  if (!name) return serviceType || 'Service'
  
  if (name.toLowerCase().includes('unknown')) {
    const typeMap: Record<string, string> = {
      'transportation': 'Private Transportation',
      'vehicle': 'Private Vehicle',
      'guide': 'Professional Guide',
      'hotel': 'Hotel Accommodation',
      'restaurant': 'Restaurant',
      'entrance': 'Entrance Fees',
    }
    
    for (const [key, value] of Object.entries(typeMap)) {
      if (name.toLowerCase().includes(key) || serviceType?.toLowerCase().includes(key)) {
        return value
      }
    }
    return 'Included Service'
  }
  
  return name
}

// Clean day title helper
function cleanDayTitle(title: string, dayNumber: number, city: string): string {
  if (!title) return city || `Day ${dayNumber}`
  let cleaned = title.replace(/^Day\s*\d+\s*[-:\u2013]\s*/i, '')
  if (!cleaned.trim()) return city || `Day ${dayNumber}`
  return cleaned
}

// Format date helper
function formatDate(dateStr: string, format: 'long' | 'short' = 'long'): string {
  const date = new Date(dateStr)
  if (format === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

// Generate HTML template
function generateHTML(
  itinerary: Itinerary,
  days: Day[],
  company: { name: string; email?: string | null; website?: string | null; primaryColor?: string | null; logoUrl?: string | null } = { name: '' }
): string {
  const brandHex = /^#[0-9a-fA-F]{6}$/.test(company.primaryColor || '') ? company.primaryColor : '#2962ff'
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  
  // Filter and process services
  const allServices: { name: string; quantity: number; rate: number; total: number }[] = []
  const seenServices = new Set<string>()
  
  days.forEach(day => {
    if (!day.services) return
    day.services
      .filter(s => s.total_cost > 0)
      .forEach(service => {
        const key = `${service.service_name}-${service.total_cost}`
        if (seenServices.has(key)) return
        seenServices.add(key)
        
        allServices.push({
          name: cleanServiceName(service.service_name, service.service_type),
          quantity: service.quantity,
          rate: service.quantity > 0 ? service.total_cost / service.quantity : service.total_cost,
          total: service.total_cost
        })
      })
  })
  
  const totalPax = itinerary.num_adults + itinerary.num_children
  const perPerson = totalPax > 0 ? itinerary.total_cost / totalPax : itinerary.total_cost

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(itinerary.itinerary_code)} - Itinerary</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', 'Noto Sans JP', sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #1f2937;
      background: white;
    }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 18mm;
      margin: 0 auto;
      background: white;
    }
    
    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .logo-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .logo-circle {
      width: 45px;
      height: 45px;
      background: ${brandHex};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 14pt;
    }
    
    .company-info h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #1f2937;
      letter-spacing: 0.5px;
    }
    
    .company-info p {
      font-size: 9pt;
      color: #6b7280;
      margin-top: 2px;
    }
    
    .quote-box {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 15px;
      text-align: right;
    }
    
    .quote-number {
      font-size: 11pt;
      font-weight: 700;
      color: ${brandHex};
    }
    
    .quote-dates {
      font-size: 8pt;
      color: #6b7280;
      margin-top: 4px;
    }
    
    /* Section Headers */
    .section-header {
      font-size: 11pt;
      font-weight: 700;
      color: #1f2937;
      margin: 20px 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* Client Card */
    .client-card {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 15px;
      display: flex;
      justify-content: space-between;
    }
    
    .client-info h3 {
      font-size: 11pt;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .client-info p {
      font-size: 9pt;
      color: #6b7280;
      margin: 2px 0;
    }
    
    .travel-info {
      text-align: right;
    }
    
    .travel-info p {
      font-size: 9pt;
      color: #6b7280;
      margin: 2px 0;
    }
    
    /* Tour Banner */
    .tour-banner {
      background: ${brandHex};
      color: white;
      border-radius: 8px;
      padding: 15px 20px;
      text-align: center;
      margin: 20px 0;
    }
    
    .tour-banner h2 {
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: 1px;
    }
    
    .tour-banner p {
      font-size: 9pt;
      opacity: 0.9;
      margin-top: 5px;
    }
    
    /* Day Cards */
    .day-card {
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    
    .day-header {
      background: #f8fafc;
      border-radius: 6px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    
    .day-badge {
      background: ${brandHex};
      color: white;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 700;
    }
    
    .day-title {
      font-size: 11pt;
      font-weight: 600;
      flex: 1;
    }
    
    .day-city {
      font-size: 8pt;
      color: #6b7280;
      background: white;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }
    
    .day-description {
      font-size: 9pt;
      color: #4b5563;
      padding: 0 12px;
      line-height: 1.6;
    }
    
    .overnight {
      font-size: 8pt;
      color: #6366f1;
      font-style: italic;
      padding: 5px 12px 0;
    }
    
    /* Pricing Table */
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    
    .pricing-table th {
      background: ${brandHex};
      color: white;
      padding: 10px 12px;
      text-align: left;
      font-size: 9pt;
      font-weight: 600;
    }
    
    .pricing-table th:nth-child(2),
    .pricing-table th:nth-child(3),
    .pricing-table th:nth-child(4) {
      text-align: right;
    }
    
    .pricing-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 9pt;
    }
    
    .pricing-table td:nth-child(2),
    .pricing-table td:nth-child(3),
    .pricing-table td:nth-child(4) {
      text-align: right;
    }
    
    .pricing-table tr:nth-child(even) {
      background: #f9fafb;
    }
    
    /* Total Box */
    .total-section {
      display: flex;
      justify-content: flex-end;
      margin: 15px 0;
    }
    
    .total-box {
      background: ${brandHex};
      color: white;
      border-radius: 8px;
      padding: 12px 25px;
      text-align: center;
    }
    
    .total-label {
      font-size: 8pt;
      opacity: 0.9;
    }
    
    .total-amount {
      font-size: 18pt;
      font-weight: 700;
      margin: 5px 0;
    }
    
    .per-person {
      font-size: 8pt;
      color: #6b7280;
      text-align: right;
      margin-top: 5px;
    }
    
    /* Terms Section */
    .terms-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 10px;
    }
    
    .terms-column h4 {
      font-size: 9pt;
      font-weight: 600;
      margin-bottom: 6px;
      color: #1f2937;
    }
    
    .terms-column ul {
      list-style: none;
      padding: 0;
    }
    
    .terms-column li {
      font-size: 8pt;
      color: #6b7280;
      padding: 2px 0;
      padding-left: 12px;
      position: relative;
    }
    
    .terms-column li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: ${brandHex};
    }
    
    /* Footer */
    .footer {
      margin-top: 25px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
    }
    
    .footer-card {
      background: #f8fafc;
      border-radius: 8px;
      padding: 15px;
    }
    
    .footer h3 {
      font-size: 11pt;
      font-weight: 700;
      color: ${brandHex};
    }
    
    .footer p {
      font-size: 8pt;
      color: #6b7280;
      margin: 4px 0;
    }
    
    .footer .tagline {
      font-style: italic;
      margin-top: 8px;
    }
    
    /* Page Number */
    .page-number {
      position: fixed;
      bottom: 10mm;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 8pt;
      color: #9ca3af;
    }
    
    @media print {
      .page {
        width: 100%;
        padding: 10mm 15mm;
      }
      
      .day-card {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <header class="header">
      <div class="logo-section">
        <div class="logo-circle">T2E</div>
        <div class="company-info">
          ${safeUrl(company.logoUrl) ? `<img src="${safeUrl(company.logoUrl)}" alt="" style="height:48px;margin-bottom:10px" />` : ''}
          <h1>${escapeHtml(company.name || '')}</h1>
          <p>Professional Itinerary & Quote</p>
        </div>
      </div>
      <div class="quote-box">
        <div class="quote-number">${escapeHtml(itinerary.itinerary_code)}</div>
        <div class="quote-dates">
          Issued: ${today}<br>
          Valid until: ${validUntil}
        </div>
      </div>
    </header>
    
    <!-- Client Information -->
    <div class="section-header">Client Information</div>
    <div class="client-card">
      <div class="client-info">
        <h3>${escapeHtml(itinerary.client_name)}</h3>
        <p>${escapeHtml(itinerary.client_email)}</p>
        ${itinerary.client_phone ? `<p>${escapeHtml(itinerary.client_phone)}</p>` : ''}
      </div>
      <div class="travel-info">
        <p><strong>Travel Date:</strong> ${formatDate(itinerary.start_date)}</p>
        <p><strong>Group:</strong> ${itinerary.num_adults} Adult${itinerary.num_adults !== 1 ? 's' : ''}${itinerary.num_children > 0 ? `, ${itinerary.num_children} Child${itinerary.num_children !== 1 ? 'ren' : ''}` : ''}</p>
        <p><strong>Duration:</strong> ${itinerary.total_days} Day${itinerary.total_days !== 1 ? 's' : ''}</p>
      </div>
    </div>
    
    <!-- Tour Banner -->
    <div class="tour-banner">
      <h2>${escapeHtml(itinerary.trip_name?.toUpperCase())}</h2>
    </div>
    
    <!-- Detailed Itinerary -->
    <div class="section-header">Detailed Itinerary</div>
    ${days.map(day => `
      <div class="day-card">
        <div class="day-header">
          <span class="day-badge">DAY ${day.day_number}</span>
          <span class="day-title">${escapeHtml(cleanDayTitle(day.title, day.day_number, day.city))}</span>
          ${day.city ? `<span class="day-city">${escapeHtml(day.city)}</span>` : ''}
        </div>
        ${day.description ? `<div class="day-description">${escapeHtml(day.description)}</div>` : ''}
        ${day.overnight_city ? `<div class="overnight">Overnight: ${escapeHtml(day.overnight_city)}</div>` : ''}
      </div>
    `).join('')}
    
    <!-- Pricing Summary -->
    <div class="section-header">Pricing Summary</div>
    ${allServices.length > 0 ? `
      <table class="pricing-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${allServices.map(service => `
            <tr>
              <td>${escapeHtml(service.name)}</td>
              <td>${service.quantity}</td>
              <td>${escapeHtml(itinerary.currency)} ${service.rate.toFixed(2)}</td>
              <td><strong>${escapeHtml(itinerary.currency)} ${service.total.toFixed(2)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p style="color: #6b7280; font-size: 9pt;">Detailed pricing available upon request.</p>'}
    
    <div class="total-section">
      <div class="total-box">
        <div class="total-label">TOTAL PRICE</div>
        <div class="total-amount">${escapeHtml(itinerary.currency)} ${itinerary.total_cost.toFixed(2)}</div>
      </div>
    </div>
    <div class="per-person">Per person: ${escapeHtml(itinerary.currency)} ${perPerson.toFixed(2)}</div>
    
    <!-- Payment & Cancellation -->
    <div class="section-header">Payment & Cancellation</div>
    <div class="terms-grid">
      <div class="terms-column">
        <h4>Payment Terms</h4>
        <ul>
          <li>30% deposit to confirm booking</li>
          <li>Balance due 7 days before travel</li>
          <li>Bank transfer, PayPal, Credit card accepted</li>
        </ul>
        <h4 style="margin-top: 12px;">Cancellation Policy</h4>
        <ul>
          <li>15+ days: Full refund minus 10% fee</li>
          <li>7-14 days: 50% refund</li>
          <li>Less than 7 days: No refund</li>
        </ul>
      </div>
      <div class="terms-column">
        <h4>Price Includes</h4>
        <ul>
          <li>All tours and transfers as listed</li>
          <li>Professional English-speaking guide</li>
          <li>Entrance fees to all sites</li>
          <li>Bottled water during tours</li>
        </ul>
        <h4 style="margin-top: 12px;">Not Included</h4>
        <ul>
          <li>Personal expenses</li>
          <li>Travel insurance (recommended)</li>
          <li>Gratuities (optional)</li>
        </ul>
      </div>
    </div>
    
    <!-- Footer -->
    <footer class="footer">
      <div class="footer-card">
        <h3>${escapeHtml(company.name || '')}</h3>
        <p>${[company.email, company.website].filter(Boolean).join(' • ')}</p>
      </div>
    </footer>
  </div>
</body>
</html>
`
}

export async function POST(request: NextRequest) {
  try {
    // `company` is the caller's tenant identity (name/email/website), supplied
    // the same way the itinerary is: this route has no in-handler session (the
    // middleware gates it), so it cannot look the tenant up itself.
    const { itinerary, days, company } = await request.json()
    
    if (!itinerary) {
      return NextResponse.json({ error: 'Itinerary data required' }, { status: 400 })
    }

    // Output gate (harness Layer 2): never render a customer PDF for a
    // non-deliverable price.
    const priceCheck = checkAmountDeliverable(itinerary.total_cost, { currency: itinerary.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    // SSRF: the logo URL is tenant-controlled and would otherwise be fetched
    // by Chromium from inside the server. Resolve and validate it here, then
    // inline the bytes as a data URI so the browser never makes that request
    // at all. A logo that fails the check is dropped, not fatal.
    const companyIn = company || { name: '' }
    let safeCompany = companyIn
    if (companyIn.logoUrl) {
      const logo = await fetchLogoBytes(companyIn.logoUrl)
      safeCompany = {
        ...companyIn,
        logoUrl: logo
          ? `data:image/${logo.format};base64,${Buffer.from(logo.bytes).toString('base64')}`
          : null,
      }
    }

    // Generate HTML
    const html = generateHTML(itinerary, days || [], safeCompany)

    // Launch Puppeteer. --no-sandbox is retained deliberately: the container
    // hosts we deploy to do not grant the user-namespace the Chromium sandbox
    // needs, and without it the browser fails to start. The SSRF vector it
    // would otherwise expose is closed above (no caller URL reaches Chromium)
    // and by the request filter below.
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none'
      ]
    })
    
    // try/finally so a throw in setContent/pdf can never leak the browser
    // process. Before this, an error between launch() and close() left a
    // Chromium orphaned on every failed request.
    let pdf: Uint8Array
    try {
      const page = await browser.newPage()
      // A hard ceiling on every page op, so a hung render cannot pin a browser
      // open indefinitely.
      page.setDefaultTimeout(20_000)

      // Belt-and-braces network filter: the only outbound requests a PDF needs
      // are Google Fonts. The logo is already inlined as a data URI, so nothing
      // caller-controlled should reach here — abort anything that is not a font
      // host or a data URI.
      await page.setRequestInterception(true)
      page.on('request', (req) => {
        const url = req.url()
        if (
          url.startsWith('data:') ||
          url.startsWith('https://fonts.googleapis.com/') ||
          url.startsWith('https://fonts.gstatic.com/')
        ) {
          req.continue()
        } else {
          req.abort()
        }
      })

      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluateHandle('document.fonts.ready')

      pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '15mm', left: '10mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width: 100%; font-size: 8pt; color: #9ca3af; text-align: center; padding: 5mm 0;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
      })
    } finally {
      await browser.close()
    }

    // Return PDF
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${escapeHtml(itinerary.itinerary_code)}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error.message },
      { status: 500 }
    )
  }
}