import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server';
import { renderToBuffer } from '@react-pdf/renderer';
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF';
import React from 'react';

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
      React.createElement(B2CQuotePDF, { quote })
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
      React.createElement(B2CQuotePDF, { quote })
    );

    // Return PDF as downloadable file
    return new NextResponse(pdfBuffer, {
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
