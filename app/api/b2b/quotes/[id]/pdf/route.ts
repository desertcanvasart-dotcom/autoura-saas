import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'

// ============================================
// B2B QUOTE PDF GENERATION
// File: app/api/b2b/quotes/[id]/pdf/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Format date helper
function formatDate(dateStr: string, format: 'long' | 'short' = 'long'): string {
  if (!dateStr) return 'TBD'
  const date = new Date(dateStr)
  if (format === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

// Generate HTML template
function generateQuoteHTML(quote: any): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const template = quote.tour_variations?.tour_templates
  const variation = quote.tour_variations
  const partner = quote.b2b_partners
  const services = quote.services_snapshot || []

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${quote.quote_number} - Quote</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', sans-serif;
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
      background: linear-gradient(135deg, #647C47, #4a5c35);
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
      font-size: 12pt;
      font-weight: 700;
      color: #647C47;
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
    
    /* Info Cards */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .info-card {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 15px;
    }
    
    .info-card h4 {
      font-size: 8pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    
    .info-card p {
      font-size: 10pt;
      font-weight: 600;
      color: #1f2937;
    }
    
    .info-card .secondary {
      font-size: 9pt;
      font-weight: 400;
      color: #6b7280;
      margin-top: 2px;
    }
    
    /* Tour Banner */
    .tour-banner {
      background: linear-gradient(135deg, #647C47, #4a5c35);
      color: white;
      border-radius: 8px;
      padding: 18px 20px;
      margin: 20px 0;
    }
    
    .tour-banner h2 {
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    
    .tour-banner p {
      font-size: 10pt;
      opacity: 0.9;
      margin-top: 5px;
    }
    
    .tour-meta {
      display: flex;
      gap: 20px;
      margin-top: 12px;
    }
    
    .tour-meta-item {
      background: rgba(255,255,255,0.15);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 9pt;
    }
    
    /* Pricing Table */
    .pricing-section {
      margin: 20px 0;
    }
    
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .pricing-table th {
      background: linear-gradient(135deg, #647C47, #4a5c35);
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
    
    /* Total Section */
    .totals-section {
      margin-top: 20px;
    }
    
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 10pt;
    }
    
    .totals-row.highlight {
      background: linear-gradient(135deg, #647C47, #4a5c35);
      color: white;
      padding: 12px 15px;
      border-radius: 6px;
      margin-top: 10px;
      border: none;
    }
    
    .totals-row.highlight .label {
      font-weight: 600;
    }
    
    .totals-row.highlight .value {
      font-size: 14pt;
      font-weight: 700;
    }
    
    .per-person-note {
      text-align: right;
      font-size: 9pt;
      color: #6b7280;
      margin-top: 8px;
    }
    
    .single-supplement {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 10px 15px;
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .single-supplement .label {
      font-size: 9pt;
      color: #92400e;
    }
    
    .single-supplement .value {
      font-size: 11pt;
      font-weight: 700;
      color: #92400e;
    }
    
    /* Tour Leader Badge */
    .tour-leader-badge {
      background: #dbeafe;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      padding: 10px 15px;
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .tour-leader-badge .label {
      font-size: 9pt;
      color: #1e40af;
    }
    
    .tour-leader-badge .value {
      font-size: 10pt;
      font-weight: 600;
      color: #1e40af;
    }
    
    /* Terms Section */
    .terms-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 15px;
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
      color: #647C47;
    }
    
    /* Notes */
    .notes-section {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 15px;
      margin-top: 20px;
    }
    
    .notes-section h4 {
      font-size: 9pt;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 5px;
    }
    
    .notes-section p {
      font-size: 9pt;
      color: #6b7280;
    }
    
    /* Footer */
    .footer {
      margin-top: 30px;
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
      color: #647C47;
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
    
    @media print {
      .page {
        width: 100%;
        padding: 10mm 15mm;
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
          <h1>TRAVEL TO EGYPT</h1>
          <p>B2B Partner Quote</p>
        </div>
      </div>
      <div class="quote-box">
        <div class="quote-number">${quote.quote_number}</div>
        <div class="quote-dates">
          Issued: ${today}<br>
          Valid until: ${formatDate(quote.valid_until, 'short')}
        </div>
      </div>
    </header>
    
    <!-- Partner & Client Info -->
    <div class="info-grid">
      ${partner ? `
      <div class="info-card">
        <h4>Partner</h4>
        <p>${partner.company_name}</p>
        <p class="secondary">${partner.partner_code}</p>
        ${partner.contact_name ? `<p class="secondary">${partner.contact_name}</p>` : ''}
      </div>
      ` : `
      <div class="info-card">
        <h4>Quote Type</h4>
        <p>Direct Client</p>
      </div>
      `}
      
      <div class="info-card">
        <h4>Client</h4>
        <p>${quote.client_name || 'To be confirmed'}</p>
        ${quote.client_email ? `<p class="secondary">${quote.client_email}</p>` : ''}
        ${quote.client_phone ? `<p class="secondary">${quote.client_phone}</p>` : ''}
        ${quote.client_nationality ? `<p class="secondary">${quote.client_nationality}</p>` : ''}
      </div>
    </div>
    
    <!-- Tour Banner -->
    <div class="tour-banner">
      <h2>${template?.template_name || 'Tour Package'}</h2>
      <p>${variation?.variation_name || ''}</p>
      <div class="tour-meta">
        <div class="tour-meta-item">
          📅 ${template?.duration_days || '-'} Days / ${template?.duration_nights || '-'} Nights
        </div>
        <div class="tour-meta-item">
          👥 ${quote.num_adults} Pax${quote.tour_leader_included ? ' (+1 TL)' : ''}
        </div>
        <div class="tour-meta-item">
          🗓️ ${quote.travel_date ? formatDate(quote.travel_date, 'short') : 'TBD'}
        </div>
        <div class="tour-meta-item">
          🌡️ ${quote.season ? quote.season.charAt(0).toUpperCase() + quote.season.slice(1) : '-'} Season
        </div>
      </div>
    </div>
    
    <!-- Services Breakdown -->
    ${services.length > 0 ? `
    <div class="section-header">Services Included</div>
    <div class="pricing-section">
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
          ${services.slice(0, 20).map((service: any) => `
            <tr>
              <td>${service.service_name || 'Service'}</td>
              <td>${service.quantity || 1}</td>
              <td>€${(service.unit_cost || 0).toFixed(2)}</td>
              <td><strong>€${(service.line_total || 0).toFixed(2)}</strong></td>
            </tr>
          `).join('')}
          ${services.length > 20 ? `
            <tr>
              <td colspan="4" style="text-align: center; color: #6b7280; font-style: italic;">
                ... and ${services.length - 20} more services
              </td>
            </tr>
          ` : ''}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Pricing Summary -->
    <div class="section-header">Pricing Summary</div>
    <div class="totals-section">
      <div class="totals-row">
        <span>Subtotal (Cost)</span>
        <span>€${(quote.total_cost || 0).toFixed(2)}</span>
      </div>
      <div class="totals-row">
        <span>Margin (${quote.margin_percent || 0}%)</span>
        <span>€${(quote.margin_amount || 0).toFixed(2)}</span>
      </div>
      <div class="totals-row highlight">
        <span class="label">SELLING PRICE</span>
        <span class="value">€${(quote.selling_price || 0).toFixed(2)}</span>
      </div>
    </div>
    
    <div class="per-person-note">
      Price per person: <strong>€${(quote.price_per_person || 0).toFixed(2)}</strong>
    </div>
    
    ${quote.tour_leader_included && quote.tour_leader_cost ? `
    <div class="tour-leader-badge">
      <span class="label">Tour Leader Cost (included in total)</span>
      <span class="value">€${quote.tour_leader_cost.toFixed(2)}</span>
    </div>
    ` : ''}
    
    ${quote.single_supplement && quote.single_supplement > 0 ? `
    <div class="single-supplement">
      <span class="label">Single Supplement (for solo travelers)</span>
      <span class="value">€${quote.single_supplement.toFixed(2)}</span>
    </div>
    ` : ''}
    
    <!-- Notes -->
    ${quote.notes ? `
    <div class="notes-section">
      <h4>Notes</h4>
      <p>${quote.notes}</p>
    </div>
    ` : ''}
    
    <!-- Terms -->
    <div class="section-header">Terms & Conditions</div>
    <div class="terms-grid">
      <div class="terms-column">
        <h4>Payment Terms</h4>
        <ul>
          <li>30% deposit to confirm booking</li>
          <li>Balance due 14 days before travel</li>
          <li>Bank transfer or credit card accepted</li>
        </ul>
        <h4 style="margin-top: 12px;">Cancellation Policy</h4>
        <ul>
          <li>30+ days: Full refund minus 10% fee</li>
          <li>15-29 days: 50% refund</li>
          <li>Less than 15 days: No refund</li>
        </ul>
      </div>
      <div class="terms-column">
        <h4>Price Includes</h4>
        <ul>
          <li>All tours and transfers as per itinerary</li>
          <li>Professional English-speaking guide</li>
          <li>Entrance fees to all sites</li>
          <li>Bottled water during tours</li>
        </ul>
        <h4 style="margin-top: 12px;">Not Included</h4>
        <ul>
          <li>International flights</li>
          <li>Personal expenses & tips</li>
          <li>Travel insurance</li>
        </ul>
      </div>
    </div>
    
    <!-- Footer -->
    <footer class="footer">
      <div class="footer-card">
        <h3>TRAVEL TO EGYPT</h3>
        <p>info@travel2egypt.org • +20 115 801 1600 • www.travel2egypt.org</p>
        <p class="tagline">Your trusted partner for authentic Egyptian experiences</p>
      </div>
    </footer>
  </div>
</body>
</html>
`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Fetch quote with related data
    const { data: quote, error } = await supabaseAdmin
      .from('tour_quotes')
      .select(`
        *,
        tour_variations (
          variation_name, variation_code, tier, group_type,
          inclusions, exclusions,
          tour_templates (
            template_name, template_code, duration_days, duration_nights,
            short_description
          )
        ),
        b2b_partners (company_name, partner_code, contact_name, email)
      `)
      .eq('id', id)
      .single()

    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Generate HTML
    const html = generateQuoteHTML(quote)

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none'
      ]
    })
    
    const page = await browser.newPage()
    
    // Set content and wait for fonts to load
    await page.setContent(html, { 
      waitUntil: ['networkidle0', 'domcontentloaded'] 
    })
    
    // Wait for fonts to fully load
    await page.evaluateHandle('document.fonts.ready')
    
    // Generate PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '15mm',
        left: '10mm'
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width: 100%; font-size: 8pt; color: #9ca3af; text-align: center; padding: 5mm 0;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `
    })
    
    await browser.close()

    // Return PDF
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${quote.quote_number}.pdf"`,
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