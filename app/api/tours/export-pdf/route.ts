// PDF Export API Endpoint
// Location: /app/api/tours/export-pdf/route.ts

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { tour, pax, is_euro_passport, pricing } = await request.json()

    // Generate HTML for PDF
    const html = generateTourHTML(tour, pax, is_euro_passport, pricing)

    // For now, return HTML that can be printed
    // Later we can use libraries like jsPDF or Puppeteer for actual PDF generation
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${tour.tour_code || 'tour'}.html"`
      }
    })

  } catch (error) {
    console.error('PDF export error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to export PDF' },
      { status: 500 }
    )
  }
}

function generateTourHTML(tour: any, pax: number, isEuro: boolean, pricing: any) {
  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${tour.tour_name} - Itinerary</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #1e40af;
      margin: 0;
    }
    .header p {
      color: #6b7280;
      margin: 5px 0;
    }
    .info-box {
      background: #eff6ff;
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin: 20px 0;
    }
    .day-section {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      page-break-inside: avoid;
    }
    .day-header {
      background: #2563eb;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      margin: -20px -20px 15px -20px;
    }
    .service-item {
      margin: 10px 0;
      padding: 10px;
      background: #f9fafb;
      border-radius: 4px;
    }
    .service-item strong {
      color: #1f2937;
    }
    .pricing-summary {
      background: #f0fdf4;
      border: 2px solid #10b981;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
    }
    .pricing-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #d1fae5;
    }
    .pricing-total {
      font-size: 1.5em;
      font-weight: bold;
      color: #047857;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 3px solid #10b981;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏛️ ${tour.tour_name}</h1>
    <p>Tour Code: ${tour.tour_code}</p>
    <p>${tour.duration_days} Days • ${tour.cities.join(' → ')}</p>
    <p style="text-transform: capitalize;">${tour.tour_type} Tour</p>
  </div>

  <div class="info-box">
    <strong>📋 Tour Information</strong><br>
    👥 Passengers: ${pax}<br>
    🛂 Passport Type: ${isEuro ? 'European Union' : 'Non-European'}<br>
    ${tour.description ? `📝 ${tour.description}<br>` : ''}
  </div>

  ${tour.days.map((day: any, index: number) => `
    <div class="day-section">
      <div class="day-header">
        <strong>Day ${day.day_number}</strong> - ${day.city}
      </div>

      ${day.accommodation ? `
        <div class="service-item">
          <strong>🏨 Accommodation:</strong> ${day.accommodation.property_name}<br>
          <small>${'⭐'.repeat(day.accommodation.star_rating)} ${day.accommodation.tier} • ${day.accommodation.board_basis} • ${day.accommodation.room_type}</small>
        </div>
      ` : ''}

      ${day.lunch_meal ? `
        <div class="service-item">
          <strong>🥗 Lunch:</strong> ${day.lunch_meal.restaurant_name}<br>
          <small>${day.lunch_meal.cuisine_type} • ${day.lunch_meal.restaurant_type}</small>
        </div>
      ` : ''}

      ${day.dinner_meal ? `
        <div class="service-item">
          <strong>🍽️ Dinner:</strong> ${day.dinner_meal.restaurant_name}<br>
          <small>${day.dinner_meal.cuisine_type} • ${day.dinner_meal.restaurant_type}</small>
        </div>
      ` : ''}

      ${day.guide_required ? `
        <div class="service-item">
          <strong>👨‍🏫 Guide:</strong> Professional tour guide included
        </div>
      ` : ''}

      ${day.notes ? `
        <div class="service-item">
          <strong>📝 Notes:</strong> ${day.notes}
        </div>
      ` : ''}
    </div>
  `).join('')}

  ${pricing ? `
    <div class="pricing-summary">
      <h2 style="margin-top: 0; color: #047857;">💰 Pricing Summary</h2>
      
      <div class="pricing-row">
        <span>🏨 Accommodation</span>
        <strong>${formatCurrency(pricing.totals.total_accommodation)}</strong>
      </div>
      <div class="pricing-row">
        <span>🍽️ Meals</span>
        <strong>${formatCurrency(pricing.totals.total_meals)}</strong>
      </div>
      <div class="pricing-row">
        <span>👨‍🏫 Guides</span>
        <strong>${formatCurrency(pricing.totals.total_guides)}</strong>
      </div>
      <div class="pricing-row">
        <span>🚗 Transportation</span>
        <strong>${formatCurrency(pricing.totals.total_transportation)}</strong>
      </div>
      <div class="pricing-row">
        <span>🎫 Entrances</span>
        <strong>${formatCurrency(pricing.totals.total_entrances)}</strong>
      </div>
      
      <div class="pricing-total">
        <div style="display: flex; justify-content: space-between;">
          <span>TOTAL</span>
          <span>${formatCurrency(pricing.totals.grand_total)}</span>
        </div>
        <div style="font-size: 0.7em; font-weight: normal; margin-top: 5px;">
          ${formatCurrency(pricing.per_person)} per person (${pax} passengers)
        </div>
      </div>
    </div>
  ` : ''}

  <div class="no-print" style="text-align: center; margin: 30px 0; padding: 20px; background: #f3f4f6; border-radius: 8px;">
    <p><strong>To save as PDF:</strong> Press Ctrl+P (Cmd+P on Mac) and select "Save as PDF"</p>
    <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 10px 30px; border-radius: 5px; cursor: pointer; font-size: 16px;">
      🖨️ Print / Save as PDF
    </button>
  </div>

  <div style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
    Generated ${new Date().toLocaleDateString()}
  </div>
</body>
</html>
  `
}