import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF'
import B2BQuotePDF from '@/components/pdf/B2BQuotePDF'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/quotes/[type]/[id]/pdf
 * Generate PDF for a quote (B2C or B2B)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params

    if (type !== 'b2c' && type !== 'b2b') {
      return NextResponse.json(
        { success: false, error: 'Invalid quote type. Must be b2c or b2b' },
        { status: 400 }
      )
    }

    // Fetch quote data
    let quote: any = null

    if (type === 'b2c') {
      const { data, error } = await supabaseAdmin
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
        .single()

      if (error) throw error
      quote = data
    } else {
      const { data, error } = await supabaseAdmin
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
        .single()

      if (error) throw error
      quote = data
    }

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Quote not found' },
        { status: 404 }
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
    return new NextResponse(pdfBuffer, {
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
