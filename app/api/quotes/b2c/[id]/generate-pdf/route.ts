import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server';
import { renderToBuffer } from '@react-pdf/renderer';
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF';
import React from 'react';
import type { Json, Tables } from '@/types/database.types';

type PdfQuote = React.ComponentProps<typeof B2CQuotePDF>['quote'];

type QuoteWithRelations = Tables<'b2c_quotes'> & {
  clients: Pick<
    Tables<'clients'>,
    'id' | 'full_name' | 'email' | 'phone' | 'nationality'
  > | null;
  itineraries: Pick<
    Tables<'itineraries'>,
    'id' | 'itinerary_code' | 'trip_name' | 'start_date' | 'end_date' | 'total_days'
  > | null;
};

function toCostBreakdown(value: Json | null): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number'
    )
  );
}

// B2CQuotePDF's props declare non-null display fields; reconcile the fetched
// row (nullable columns) to that shape without changing what gets rendered.
function toPdfQuote(quote: QuoteWithRelations): PdfQuote {
  return {
    quote_number: quote.quote_number,
    num_travelers: quote.num_travelers,
    tier: quote.tier,
    selling_price: quote.selling_price,
    price_per_person: quote.price_per_person,
    total_cost: quote.total_cost,
    margin_percent: quote.margin_percent,
    currency: quote.currency,
    cost_breakdown: toCostBreakdown(quote.cost_breakdown),
    valid_until: quote.valid_until,
    created_at: quote.created_at ?? '',
    client_notes: quote.client_notes,
    clients: quote.clients
      ? {
          full_name: quote.clients.full_name ?? '',
          email: quote.clients.email ?? '',
          phone: quote.clients.phone ?? '',
          nationality: quote.clients.nationality ?? '',
        }
      : null,
    itineraries: quote.itineraries
      ? {
          itinerary_code: quote.itineraries.itinerary_code,
          trip_name: quote.itineraries.trip_name ?? '',
          start_date: quote.itineraries.start_date ?? '',
          end_date: quote.itineraries.end_date ?? '',
          total_days: quote.itineraries.total_days ?? 0,
        }
      : null,
  };
}

/**
 * POST /api/quotes/b2c/[id]/generate-pdf
 * Generate PDF for a B2C quote and store it in Supabase storage
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quoteId } = await params;

    // Authenticate and get user
    const { supabase, user } = await requireAuth();

    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Get user's tenant
    const { data: membership } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'User does not belong to any tenant' },
        { status: 403 }
      );
    }

    const tenantId = membership.tenant_id;

    // Fetch the quote with related data
    const { data: quote, error: quoteError } = await supabase
      .from('b2c_quotes')
      .select(`
        *,
        clients (
          id,
          full_name,
          email,
          phone,
          nationality
        ),
        itineraries (
          id,
          itinerary_code,
          trip_name,
          start_date,
          end_date,
          total_days
        )
      `)
      .eq('id', quoteId)
      .eq('tenant_id', tenantId)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json(
        { success: false, error: 'Quote not found' },
        { status: 404 }
      );
    }

    // Generate PDF using React PDF renderer
    const pdfBuffer = await renderToBuffer(
      React.createElement(B2CQuotePDF, { quote: toPdfQuote(quote) }) as any
    );

    // Generate storage path
    const fileName = `${tenantId}/b2c/${quoteId}.pdf`;

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('quote-pdfs')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true, // Overwrite if exists
      });

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError);
      return NextResponse.json(
        { success: false, error: 'Failed to upload PDF to storage' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('quote-pdfs')
      .getPublicUrl(fileName);

    const pdfUrl = urlData.publicUrl;

    // Update quote with PDF URL
    const { error: updateError } = await supabase
      .from('b2c_quotes')
      .update({
        pdf_url: pdfUrl,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq('id', quoteId);

    if (updateError) {
      console.error('Error updating quote with PDF URL:', updateError);
      // PDF was generated but failed to save URL - not critical
    }

    return NextResponse.json({
      success: true,
      pdf_url: pdfUrl,
      message: 'PDF generated successfully',
    });
  } catch (error: any) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/quotes/b2c/[id]/generate-pdf
 * Generate and download PDF for a B2C quote
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quoteId } = await params;

    // Authenticate and get user
    const { supabase, user } = await requireAuth();

    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Get user's tenant
    const { data: membership } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'User does not belong to any tenant' },
        { status: 403 }
      );
    }

    const tenantId = membership.tenant_id;

    // Fetch the quote with related data
    const { data: quote, error: quoteError } = await supabase
      .from('b2c_quotes')
      .select(`
        *,
        clients (
          id,
          full_name,
          email,
          phone,
          nationality
        ),
        itineraries (
          id,
          itinerary_code,
          trip_name,
          start_date,
          end_date,
          total_days
        )
      `)
      .eq('id', quoteId)
      .eq('tenant_id', tenantId)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json(
        { success: false, error: 'Quote not found' },
        { status: 404 }
      );
    }

    // Generate PDF using React PDF renderer
    const pdfBuffer = await renderToBuffer(
      React.createElement(B2CQuotePDF, { quote: toPdfQuote(quote) }) as any
    );

    // Return PDF as downloadable file
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="quote-${quote.quote_number}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
