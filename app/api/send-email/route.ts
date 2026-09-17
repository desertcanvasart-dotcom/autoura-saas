import { NextResponse } from 'next/server'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { requireAuth } from '@/lib/supabase-server'
import { sendMail } from '@/lib/email-send'
import { resolveSender } from '@/lib/tenant-email-domain'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { effectiveItineraryTotal } from '@/lib/itinerary-client-total'

export async function POST(request: Request) {
  try {
    // Authenticated users only — this route sends mail through the company
    // mailbox, so it must never be callable anonymously.
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    // Who the client should see, and where their reply should land. This route
    // hardcoded one operator's name and BCC'd a single Gmail mailbox, which is
    // wrong in a multi-tenant product: every tenant's clients saw the same
    // sender. Resend sends from a verified platform domain, so replyTo is what
    // actually routes a client's reply back to the operator.
    const { data: tenant } = await auth.supabase!
      .from('tenants')
      .select('company_name, contact_email, company_phone, company_website, email_domain, email_from_local, email_domain_status')
      .eq('id', auth.tenant_id!)
      .maybeSingle()

    const { itineraryId, clientName, clientEmail, pdfBase64 } = await request.json()

    if (!clientEmail) {
      return NextResponse.json(
        { success: false, error: 'Client email is required' },
        { status: 400 }
      )
    }
    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'itineraryId is required' },
        { status: 400 }
      )
    }

    // The price, currency, code and trip name come from the DATABASE, never the
    // request. The page used to send totalCost as a string (toFixed(2)), which
    // the gate below rejects — every itinerary email failed with 422 — and a
    // browser-supplied total could put any figure in front of a client.
    const { data: itinerary } = await auth.supabase!
      .from('itineraries')
      .select('id, itinerary_code, trip_name, client_name, currency, total_cost, margin_percent')
      .eq('id', itineraryId)
      .eq('tenant_id', auth.tenant_id!)
      .maybeSingle()

    if (!itinerary) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    const { data: days, error: daysError } = await auth.supabase!
      .from('itinerary_days')
      .select('id')
      .eq('itinerary_id', itinerary.id)
    const dayIds = (days || []).map(d => d.id)
    const { data: services, error: servicesError } = dayIds.length
      ? await auth.supabase!
          .from('itinerary_services')
          .select('total_cost, client_price')
          .in('itinerary_day_id', dayIds)
      : { data: [], error: null }

    // A failed read must not become a smaller total (silent-empty is the enemy).
    if (daysError || servicesError) {
      return NextResponse.json(
        { success: false, error: 'Could not read the itinerary services' },
        { status: 500 }
      )
    }

    const totalCost = effectiveItineraryTotal(itinerary, services || [])
    const currency = itinerary.currency ?? ''
    const itineraryCode = itinerary.itinerary_code
    const tripName = itinerary.trip_name ?? ''
    const recipientName = clientName || itinerary.client_name || ''

    // Itinerary email with PDF — output gate (harness Layer 2): never email a
    // non-deliverable price.
    const priceCheck = checkAmountDeliverable(totalCost, { currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    // Generate email HTML
    const emailHtml = generateEmailTemplate(
      recipientName,
      itineraryCode,
      tripName,
      totalCost.toFixed(2),
      currency,
      {
        company: tenant?.company_name || '',
        email: tenant?.contact_email || '',
        phone: tenant?.company_phone || '',
        website: tenant?.company_website || '',
      }
    )

    const result = await sendMail({
      to: clientEmail,
      ...(tenant?.contact_email
        ? { bcc: tenant.contact_email, replyTo: tenant.contact_email }
        : {}),
      from: resolveSender(tenant, process.env.RESEND_FROM_EMAIL || '').from,
      subject: `Your Egypt Tour Itinerary - ${tripName} (${itineraryCode})`,
      html: emailHtml,
      attachments: pdfBase64 ? [{
        filename: `${itineraryCode}_${recipientName.replace(/\s+/g, '_')}.pdf`,
        content: pdfBase64,
        encoding: 'base64'
      }] : []
    })

    if (!result.success) {
      if (result.authError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Email is not configured.',
            details:
              'Set RESEND_API_KEY and RESEND_FROM_EMAIL, and verify the sending domain in Resend.'
          },
          { status: 401 }
        )
      }
      return NextResponse.json(
        { success: false, error: 'Failed to send email', message: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Email sent successfully'
    })

  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send email',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}