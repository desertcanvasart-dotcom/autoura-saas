import { effectiveItineraryTotal } from '@/lib/itinerary-client-total'
import { serverPdfFontFor } from '@/lib/pdf/jspdf-font-server'
import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { uploadShareablePdf } from '@/lib/storage/shareable-pdf'
import { contractNumber, contractDestinations } from '@/lib/contract-facts'
import { generateContractPDF } from '@/lib/contract-pdf-generator'
import { identityFromTenant } from '@/lib/company-identity'
import { checkPublicHttpUrl } from '@/lib/ssrf-guard'
import { contractPrice, contractSettingsFromTenant, sanitizeContractEdits } from '@/lib/contract-terms'

export async function POST(request: NextRequest) {
  try {
    // Require authentication - sends WhatsApp messages (costs money)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { itineraryId } = body
    // What the operator set on the contract page (bounded, strings only).
    // The parties and the recipient still come from the database.
    const edits = sanitizeContractEdits(body.contract)

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    // Get itinerary details
    const { data: itinerary, error: dbError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (dbError || !itinerary) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    if (!itinerary.client_phone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number not found' },
        { status: 400 }
      )
    }

    if (!itinerary.start_date || !itinerary.end_date) {
      return NextResponse.json(
        { success: false, error: 'Itinerary start and end dates are required' },
        { status: 400 }
      )
    }

    const { data: contractDays } = await supabase
      .from('itinerary_days')
      .select('day_number, city, overnight_city')
      .eq('itinerary_id', itineraryId)

    const numAdults = itinerary.num_adults || 1
    const numChildren = itinerary.num_children || 0
    // No price yet = "To be confirmed", never 0.00.
    // The client total from the services (lib/itinerary-client-total), the
    // figure the quote sends use; the header cache can be 0 or stale.
    const { data: priceLines } = await supabase
      .from('itinerary_services')
      .select('total_cost, client_price')
      .eq('itinerary_id', itineraryId)
    const clientTotal = effectiveItineraryTotal(itinerary, priceLines ?? [])
    const totalCost: number | null = edits.totalCost !== undefined
      ? edits.totalCost
      : clientTotal > 0 ? clientTotal : null
    const tourName = edits.tourName?.trim() || itinerary.trip_name || 'Your tour'

    // Generate contract PDF

    // The contract names the operator as the legal Service Provider party —
    // it must be the tenant, never a hardcoded company.
    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    // Country, governing law and deposit (Settings → Organization). Read on
    // their own: before migration 403 the columns are missing, and the
    // contract then says nothing about a country rather than failing.
    const { data: contractTenant } = await createAdminClient()
      .from('tenants')
      .select('operating_country, contract_governing_law, deposit_percent')
      .eq('id', authResult.tenant_id)
      .maybeSingle()
    const contractData = {
      company: {
        // The letterhead: Settings → Organization, as on every document.
        ...identityFromTenant(senderTenant),
        name: senderTenant?.company_name || '',
        email: senderTenant?.contact_email || null,
        phone: senderTenant?.company_phone || null,
        website: senderTenant?.company_website || null,
        primaryColor: senderTenant?.primary_color || null,
        // SSRF: the generator will fetch this URL server-side, so validate it
        // first and drop anything resolving to a private/metadata address.
        logoUrl:
          senderTenant?.logo_url &&
          (await checkPublicHttpUrl(senderTenant.logo_url)).ok
            ? senderTenant.logo_url
            : null,
      },
      contractNumber: contractNumber(itineraryId),
      contractDate: new Date().toISOString(),
      clientName: itinerary.client_name || 'Valued Guest',
      clientEmail: itinerary.client_email || undefined,
      numTravelers: numAdults + numChildren,
      tourName,
      startDate: itinerary.start_date,
      endDate: itinerary.end_date,
      // The trip's own cities — never an invented default.
      destinations: edits.destinations?.trim() || contractDestinations(contractDays ?? []),
      totalCost,
      currency: itinerary.currency || 'EUR',
      settings: contractSettingsFromTenant(contractTenant),
      terms: edits,
    }

    const pdfBytes = await generateContractPDF({ ...contractData, font: await serverPdfFontFor(contractData) })

    // Upload to Supabase Storage

    // Private bucket + signed link (lib/storage/shareable-pdf.ts): the old
    // `documents` bucket never existed — "Bucket not found".
    const shared = await uploadShareablePdf(createAdminClient(), {
      tenantId: authResult.tenant_id,
      kind: 'contracts',
      fileName: `contract-${itineraryId}-${Date.now()}.pdf`,
      bytes: pdfBytes,
    })
    if (!shared.ok) {
      console.error('❌ Upload error:', shared.error)
      throw new Error(shared.error)
    }
    const pdfUrl = shared.url


    // Build message
    const businessName = senderTenant?.company_name || ''

    const message = (businessName ? `📄 *${businessName}* 📄\n\n` : '') +
      `Dear ${itinerary.client_name || 'Valued Guest'},\n\n` +
      `Your tour contract is ready! 🎉\n\n` +
      `📋 *Contract Details:*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${tourName}\n` +
      `📅 *Dates:* ${new Date(itinerary.start_date).toLocaleDateString()} - ${new Date(itinerary.end_date).toLocaleDateString()}\n` +
      `👥 *Travelers:* ${numAdults} adult${numAdults > 1 ? 's' : ''}` +
      `${numChildren > 0 ? `, ${numChildren} child${numChildren > 1 ? 'ren' : ''}` : ''}\n` +
      `💰 *Total:* ${contractPrice(totalCost, itinerary.currency)}\n\n` +
      `📄 Please review the attached contract carefully.\n\n` +
      `✍️ *Next Steps:*\n` +
      `1. Review all terms and conditions\n` +
      `2. Sign the contract\n` +
      `3. Return signed copy to us\n` +
      `4. Complete payment\n\n` +
      `If you have any questions, please don't hesitate to reach out!\n\n` +
      (senderTenant?.contact_email ? `📧 ${senderTenant.contact_email}\n` : '') +
      (senderTenant?.company_website ? `🌐 ${senderTenant.company_website}\n` : '') + '\n' +
      `Looking forward to your adventure! ✨\n\n` +
      `Best regards,\n${businessName ? businessName + ' Team' : 'Your travel team'}`

    // Send via WhatsApp WITH PDF attachment
    const result = await sendWhatsAppMessage({
      to: itinerary.client_phone,
      body: message,
      mediaUrl: pdfUrl
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }



    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      pdfUrl: pdfUrl,
      message: 'Contract sent successfully via WhatsApp with PDF attachment'
    })

  } catch (error: any) {
    console.error('❌ Error sending contract:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}