import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF'
import B2BQuotePDF from '@/components/pdf/B2BQuotePDF'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { quoteCompleteness, allowsIncomplete, describeGaps } from '@/lib/pricing/quote-completeness'

/**
 * GET /api/quotes/[type]/[id]/pdf
 * Generate PDF for a quote (B2C or B2B)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { type, id } = await params

    if (type !== 'b2c' && type !== 'b2b') {
      return NextResponse.json(
        { success: false, error: 'Invalid quote type. Must be b2c or b2b' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient()

    // Fetch quote data
    let quote: any = null

    if (type === 'b2c') {
      const { data, error } = await (supabaseAdmin as any)
        .from('b2c_quotes')
        .select(`
          *,
          clients (
            full_name,
            email,
            phone,
            nationality
          ),
          itineraries (
            itinerary_code,
            trip_name,
            start_date,
            end_date,
            total_days
          )
        `)
        .eq('id', id)
        .eq('tenant_id', authResult.tenant_id)
        .maybeSingle()

      if (error) throw error
      quote = data
    } else {
      const { data, error } = await (supabaseAdmin as any)
        .from('b2b_quotes')
        .select(`
          *,
          b2b_partners (
            company_name,
            partner_code,
            contact_name,
            email,
            country
          ),
          itineraries (
            itinerary_code,
            trip_name,
            start_date,
            total_days
          )
        `)
        .eq('id', id)
        .eq('tenant_id', authResult.tenant_id)
        .maybeSingle()

      if (error) throw error
      quote = data
    }

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Quote not found' },
        { status: 404 }
      )
    }

    // A quote that could not be fully priced does not become a PDF by
    // accident. The quote's own lines say what is missing (every service the
    // engine could not price is kept at 0 with the reason on it), so the
    // refusal can name them. `allow_incomplete=true` is the explicit override
    // for an operator who means it.
    const { searchParams: gateParams } = new URL(request.url)
    const completeness = quoteCompleteness(quote.services_snapshot)
    if (!completeness.complete && !allowsIncomplete(gateParams.get('allow_incomplete'))) {
      return NextResponse.json(
        {
          success: false,
          error: `This quote has ${completeness.gaps.length} service(s) with no price: ${describeGaps(completeness.gaps)}. Add the rates, or send it anyway with allow_incomplete=true.`,
          gaps: completeness.gaps,
        },
        { status: 422 }
      )
    }

    // Generate PDF
    let pdfBuffer: Buffer

    if (type === 'b2c') {
      const pdfDoc = createElement(B2CQuotePDF, { quote })
      pdfBuffer = await renderToBuffer(pdfDoc as any) as Buffer
    } else {
      const pdfDoc = createElement(B2BQuotePDF, { quote })
      pdfBuffer = await renderToBuffer(pdfDoc as any) as Buffer
    }

    // Get download parameter
    const { searchParams } = new URL(request.url)
    const download = searchParams.get('download') === 'true'

    // Set response headers
    const headers = new Headers()
    headers.set('Content-Type', 'application/pdf')
    headers.set('Content-Length', pdfBuffer.length.toString())

    if (download) {
      const filename = `${quote.quote_number}.pdf`
      headers.set('Content-Disposition', `attachment; filename="${filename}"`)
    } else {
      headers.set('Content-Disposition', 'inline')
    }

    // Return PDF
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    })

  } catch (error: any) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
