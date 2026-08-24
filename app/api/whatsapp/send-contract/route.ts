import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth } from '@/lib/supabase-server'
import { generateContractPDF } from '@/lib/contract-pdf-generator'

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

    const numAdults = itinerary.num_adults || 1
    const numChildren = itinerary.num_children || 0
    const totalCost = itinerary.total_cost || 0

    // Generate contract PDF

    // The contract names the operator as the legal Service Provider party —
    // it must be the tenant, never a hardcoded company.
    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const contractData = {
      company: {
        name: senderTenant?.company_name || '',
        email: senderTenant?.contact_email || null,
        phone: senderTenant?.company_phone || null,
        website: senderTenant?.company_website || null,
        primaryColor: senderTenant?.primary_color || null,
        logoUrl: senderTenant?.logo_url || null,
      },
      contractNumber: `TC-2025-${itineraryId.slice(0, 8).toUpperCase()}`,
      contractDate: new Date().toISOString(),
      clientName: itinerary.client_name || 'Valued Guest',
      clientEmail: itinerary.client_email || undefined,
      numTravelers: numAdults + numChildren,
      tourName: itinerary.trip_name || 'Egypt Tour',
      startDate: itinerary.start_date,
      endDate: itinerary.end_date,
      destinations: 'Cairo, Luxor, Aswan',
      totalCost: totalCost,
      currency: itinerary.currency || 'EUR'
    }

    const pdfBytes = await generateContractPDF(contractData)

    // Upload to Supabase Storage

    const fileName = `contracts/contract-${itineraryId}-${Date.now()}.pdf`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      })

    if (uploadError) {
      console.error('❌ Upload error:', uploadError)
      throw new Error(`Failed to upload PDF: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName)

    const pdfUrl = urlData.publicUrl


    // Build message
    const businessName = senderTenant?.company_name || ''

    const message = (businessName ? `📄 *${businessName}* 📄\n\n` : '') +
      `Dear ${itinerary.client_name || 'Valued Guest'},\n\n` +
      `Your tour contract is ready! 🎉\n\n` +
      `📋 *Contract Details:*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Egypt Tour'}\n` +
      `📅 *Dates:* ${new Date(itinerary.start_date).toLocaleDateString()} - ${new Date(itinerary.end_date).toLocaleDateString()}\n` +
      `👥 *Travelers:* ${numAdults} adult${numAdults > 1 ? 's' : ''}` +
      `${numChildren > 0 ? `, ${numChildren} child${numChildren > 1 ? 'ren' : ''}` : ''}\n` +
      `💰 *Total:* ${itinerary.currency} ${totalCost.toFixed(2)}\n\n` +
      `📄 Please review the attached contract carefully.\n\n` +
      `✍️ *Next Steps:*\n` +
      `1. Review all terms and conditions\n` +
      `2. Sign the contract\n` +
      `3. Return signed copy to us\n` +
      `4. Complete payment\n\n` +
      `If you have any questions, please don't hesitate to reach out!\n\n` +
      (senderTenant?.contact_email ? `📧 ${senderTenant.contact_email}\n` : '') +
      (senderTenant?.company_website ? `🌐 ${senderTenant.company_website}\n` : '') + '\n' +
      `Looking forward to your adventure! 🐪✨\n\n` +
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