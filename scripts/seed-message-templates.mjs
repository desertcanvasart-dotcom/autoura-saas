#!/usr/bin/env node
// ============================================================================
// seed-message-templates.mjs — lifecycle message templates for a tenant
//
//   node scripts/seed-message-templates.mjs --tenant "Autoura Sandbox"          # dry-run
//   node scripts/seed-message-templates.mjs --tenant "Autoura Sandbox" --apply  # write
//
// Seeds the full communication lifecycle: customer (lead → quote → booking →
// pre-departure → on tour → post-tour), B2B partner operations (reservation,
// amendment, cancellation, rates, settlement) and supplier correspondence
// (booking request, voucher, amendment, cancellation).
//
// Rules, consistent with the repo's no-fabrication ethos:
//   * No invented business policy. Cancellation/amendment terms are written
//     as "[review: insert your policy]" markers the operator must fill —
//     a template that quietly invents "50% within 30 days" would end up in
//     front of a client as if it were the operator's real terms.
//   * Idempotent on (tenant_id, name): re-running updates body/subject in
//     place, never duplicates. Operator edits to OTHER fields (is_active,
//     category) are preserved on update.
//   * Templates are tenant-scoped (there is no global template catalog);
//     run per tenant.
//
// English only for now — matches the deferred per-tenant i18n plan
// (docs/I18N-PHASE1.md).
// ============================================================================

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
dotenv.config({ path: new URL('../.env.local', import.meta.url).pathname })

const APPLY = process.argv.includes('--apply')
const tenantArgIdx = process.argv.indexOf('--tenant')
const TENANT_NAME = tenantArgIdx > -1 ? process.argv[tenantArgIdx + 1] : null

if (!TENANT_NAME) {
  console.error('Usage: node scripts/seed-message-templates.mjs --tenant "<company_name>" [--apply]')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}
// Say WHERE the write is going before it goes — .env.local on this project
// points at the live database (A-item 23).
console.log(`target: ${new URL(url).host} — ${APPLY ? 'APPLYING' : 'dry run (pass --apply to write)'}`)

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

const extractPlaceholders = (text) =>
  [...new Set([...(text || '').matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]))]

// ---------------------------------------------------------------------------
// The catalog. name is the idempotency key — do not rename casually.
// ---------------------------------------------------------------------------
const TEMPLATES = [
  // ── CUSTOMER · lead ──────────────────────────────────────────────────────
  {
    name: 'Inquiry acknowledgment',
    category: 'customer', subcategory: 'lead', channel: 'both',
    description: 'First reply to a new inquiry — sets response expectations.',
    subject: 'We received your inquiry — {{company_name}}',
    body: `Dear {{client_first_name}},

Thank you for reaching out to {{company_name}}! We're excited to help you plan your trip to Egypt.

We've received your inquiry and one of our travel specialists is already working on it. You can expect a personalised proposal from us within 24 hours.

If you'd like to add anything in the meantime — travel dates, group size, must-see places — just reply to this message.

Warm regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Lead follow-up nudge',
    category: 'customer', subcategory: 'lead', channel: 'whatsapp',
    description: 'Gentle nudge when a lead has gone quiet for 2–3 days.',
    subject: null,
    body: `Hi {{client_first_name}}! 👋 Just checking in — we're still holding your travel ideas for Egypt and would love to help you take the next step. Is there anything you'd like us to adjust or explain? — {{agent_name}}, {{company_name}}`,
  },
  {
    name: 'Quote sent',
    category: 'customer', subcategory: 'lead', channel: 'email',
    description: 'Accompanies the quote when it is sent to the client.',
    subject: 'Your personalised Egypt itinerary — {{trip_name}}',
    body: `Dear {{client_first_name}},

It was a pleasure preparing this for you! Please find your personalised proposal for {{trip_name}} ({{trip_dates}}, {{total_days}}).

Total for your party: {{total}}

Everything in the itinerary can be adjusted — hotels, pace, excursions. Tell us what you'd change and we'll revise it the same day.

This proposal is valid until the date shown on the quote; availability and rates are only guaranteed once your booking is confirmed.

Looking forward to your thoughts!

Warm regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Quote follow-up',
    category: 'customer', subcategory: 'lead', channel: 'whatsapp',
    description: 'Client viewed the quote but has not replied.',
    subject: null,
    body: `Hi {{client_first_name}}! Have you had a chance to look at your {{trip_name}} proposal? Happy to fine-tune anything — different hotels, more free time, extra excursions. Just say the word 😊 — {{agent_name}}`,
  },
  {
    name: 'Quote expiring soon',
    category: 'customer', subcategory: 'lead', channel: 'both',
    description: 'Validity date approaching — availability not guaranteed after.',
    subject: 'Your {{trip_name}} proposal expires soon',
    body: `Dear {{client_first_name}},

A quick heads-up: your proposal for {{trip_name}} is approaching its validity date. After that we can no longer guarantee the quoted rates and availability, especially for {{start_date}} departures.

If you'd like to secure it, a confirmation now locks everything in. If the timing no longer works, tell us — we'll gladly re-plan around new dates.

Warm regards,
{{agent_name}}
{{company_name}}`,
  },

  // ── CUSTOMER · booking ───────────────────────────────────────────────────
  {
    name: 'Booking confirmed — deposit request',
    category: 'customer', subcategory: 'booking', channel: 'email',
    description: 'Quote accepted → booking created; requests the deposit.',
    subject: 'Booking {{itinerary_code}} confirmed — deposit details inside',
    body: `Dear {{client_first_name}},

Wonderful news — your booking for {{trip_name}} ({{trip_dates}}) is reserved under reference {{itinerary_code}}!

To confirm your trip we kindly ask for a deposit of {{deposit}}. The remaining balance of {{balance}} is due before departure (details on your booking).

Payment instructions are attached. As soon as the deposit arrives, everything is locked in and we start arranging your services.

Any questions at all — we're one reply away.

Warm regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Deposit received — trip secured',
    category: 'customer', subcategory: 'booking', channel: 'both',
    description: 'Sent when the deposit payment is recorded.',
    subject: 'Deposit received — {{trip_name}} is confirmed! 🎉',
    body: `Dear {{client_first_name}},

We've received your deposit — thank you! Your trip {{trip_name}} ({{trip_dates}}) is now fully confirmed under reference {{itinerary_code}}.

Remaining balance: {{balance}}

We're now confirming all your services. Closer to departure you'll receive your pre-travel checklist and final details.

You're officially going to Egypt! 🇪🇬

Warm regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Balance reminder',
    category: 'customer', subcategory: 'booking', channel: 'both',
    description: 'Reminder ~30 days before departure.',
    subject: 'Balance for {{trip_name}} — due soon',
    body: `Dear {{client_first_name}},

Your departure on {{start_date}} is getting close! A friendly reminder that the remaining balance of {{balance}} for booking {{itinerary_code}} is due.

Once settled, everything is done on your side — nothing left but packing.

Payment details are on your booking confirmation; reply here if you'd like them re-sent.

Warm regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Payment complete',
    category: 'customer', subcategory: 'booking', channel: 'both',
    description: 'Sent when the booking reaches paid in full.',
    subject: 'All settled — see you soon, {{client_first_name}}!',
    body: `Dear {{client_first_name}},

Your booking {{itinerary_code}} is now paid in full — thank you! 🎉

Nothing more is needed from your side. Your final travel details and emergency contacts will reach you a few days before departure on {{start_date}}.

Counting down with you!

Warm regards,
{{agent_name}}
{{company_name}}`,
  },

  // ── CUSTOMER · pre-departure ─────────────────────────────────────────────
  {
    name: 'Pre-travel checklist',
    category: 'customer', subcategory: 'pre_departure', channel: 'email',
    description: '~2 weeks out: passport, visa, packing, practical tips.',
    subject: 'Getting ready for Egypt — your pre-travel checklist',
    body: `Dear {{client_first_name}},

{{trip_name}} is only two weeks away! Here's your checklist:

PASSPORT & VISA
• Passport valid at least 6 months beyond {{end_date}}
• Egypt entry visa: most nationalities can obtain a visa on arrival or an e-visa in advance — [review: confirm guidance for your main markets]

PACKING ESSENTIALS
• Light, breathable clothing + one warmer layer for evenings
• Comfortable walking shoes, sun protection, refillable water bottle
• Modest attire for mosque and church visits (shoulders and knees covered)

MONEY
• Egyptian Pounds for small purchases and tips; cards widely accepted in hotels
• We recommend carrying some small notes for bazaars

HEALTH
• Drink bottled water only; consult your doctor about routine vaccinations

Your final itinerary and emergency contacts follow a few days before departure.

Questions? Just reply — we're here.

Warm regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Final details & emergency contacts',
    category: 'customer', subcategory: 'pre_departure', channel: 'email',
    description: '~3 days out: final itinerary, contacts, airport meeting point.',
    subject: 'Final details for {{trip_name}} — departing {{start_date}}',
    body: `Dear {{client_first_name}},

Almost time! Attached is your final itinerary for {{trip_name}} ({{trip_dates}}), reference {{itinerary_code}}.

KEY CONTACTS (save these now)
• Your trip manager: {{agent_name}} — available on this number/WhatsApp throughout your trip
• 24/7 emergency line: [review: insert emergency phone]

ON ARRIVAL
Our representative will meet you at the airport holding a sign with your name, before passport control where applicable, and will assist with visa and luggage.

If any flight detail changes, message us immediately and we'll adjust the pickup.

Safe travels — Egypt is waiting for you! 🇪🇬

Warm regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Arrival & meet-and-greet details',
    category: 'customer', subcategory: 'pre_departure', channel: 'whatsapp',
    description: 'Day before arrival: who meets them, where, what to look for.',
    subject: null,
    body: `Hi {{client_first_name}}! Tomorrow's the day 🎉 Quick recap for your arrival:

✈️ Our airport representative will be waiting with a "{{client_name}}" sign
🛂 They'll help you through visa & luggage
🚗 Private transfer to your hotel is arranged

If your flight is delayed or anything changes, message me here — I'm on this number the whole time. Safe flight! — {{agent_name}}`,
  },

  // ── CUSTOMER · on tour ───────────────────────────────────────────────────
  {
    name: 'Welcome check-in (day 1)',
    category: 'customer', subcategory: 'on_tour', channel: 'whatsapp',
    description: 'Day 1: confirm arrival went smoothly, open the line.',
    subject: null,
    body: `Welcome to Egypt, {{client_first_name}}! 🇪🇬 I hope the arrival and check-in went smoothly. I'm your contact for anything at all during {{trip_name}} — a question, a change, a restaurant tip, anything. Enjoy every moment! — {{agent_name}}, {{company_name}}`,
  },
  {
    name: 'Farewell & safe travels',
    category: 'customer', subcategory: 'on_tour', channel: 'whatsapp',
    description: 'Departure day send-off.',
    subject: null,
    body: `Dear {{client_first_name}}, it was a true pleasure having you with us for {{trip_name}}! 🙏 Your departure transfer is confirmed — your driver will be at the hotel at the agreed time. Safe travels home, and we hope Egypt left you with memories for a lifetime. — {{agent_name}} & the whole {{company_name}} team`,
  },

  // ── CUSTOMER · post-tour ─────────────────────────────────────────────────
  {
    name: 'Thank you & review request',
    category: 'customer', subcategory: 'post_tour', channel: 'email',
    description: '~3 days after return: gratitude + review ask.',
    subject: 'Thank you for travelling with {{company_name}}!',
    body: `Dear {{client_first_name}},

Welcome home! We hope {{trip_name}} exceeded your expectations and that you're already missing Egyptian sunsets.

It was an honour to be part of your journey. If you have two minutes, a short review would mean the world to our small team — it's how other travellers find us:

[review: insert your Google/Tripadvisor review link]

And if anything wasn't perfect, please tell us directly — we genuinely want to know.

With gratitude,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Welcome back — return offer',
    category: 'customer', subcategory: 'post_tour', channel: 'email',
    description: 'Win-back ~6 months later.',
    subject: 'Egypt misses you, {{client_first_name}} — your next adventure?',
    body: `Dear {{client_first_name}},

It's been a while since {{trip_name}} — we still smile thinking about it!

Egypt has more to show you: the White Desert, Siwa Oasis, diving in the Red Sea, or a slow Nile cruise you didn't have time for. As a returning guest of {{company_name}}, you'll always get our best care — and our best rates.

If a new adventure is on your mind for this year, reply and we'll sketch something around your dates. No obligation, just ideas.

Warm regards,
{{agent_name}}
{{company_name}}`,
  },

  // ── PARTNER (B2B) ────────────────────────────────────────────────────────
  {
    name: 'Partner — reservation received',
    category: 'partner', subcategory: 'reservation', channel: 'email',
    description: 'Acknowledge a partner reservation request before confirmation.',
    subject: 'Reservation request received — {{trip_name}}',
    body: `Dear {{partner_name}},

Thank you — we've received your reservation request for {{trip_name}} ({{trip_dates}}).

We're checking availability with all services now and will send the formal confirmation within one business day. Nothing is guaranteed until you receive it.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Partner — reservation confirmed',
    category: 'partner', subcategory: 'reservation', channel: 'email',
    description: 'Formal confirmation of a partner reservation with services.',
    subject: 'CONFIRMED: {{itinerary_code}} — {{trip_name}}, {{trip_dates}}',
    body: `Dear {{partner_name}},

We're pleased to confirm your reservation:

Reference: {{itinerary_code}}
Programme: {{trip_name}}
Dates: {{trip_dates}} ({{total_days}})
All services as per the attached programme are confirmed.

Rooming list and passenger passport details are kindly requested no later than [review: insert your deadline] before arrival.

Amendments and cancellations are handled as per our agreement.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Partner — amendment confirmation',
    category: 'partner', subcategory: 'amendment', channel: 'email',
    description: 'Confirms a change to an existing partner reservation.',
    subject: 'AMENDED: {{itinerary_code}} — changes confirmed',
    body: `Dear {{partner_name}},

We confirm the following amendment to reservation {{itinerary_code}} ({{trip_name}}):

{{details}}

All other services remain unchanged as originally confirmed. Where the amendment affects the price, an updated statement follows separately.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Partner — cancellation confirmation',
    category: 'partner', subcategory: 'cancellation', channel: 'email',
    description: 'Confirms cancellation of a partner reservation.',
    subject: 'CANCELLED: {{itinerary_code}} — cancellation confirmed',
    body: `Dear {{partner_name}},

As requested, we confirm the cancellation of reservation {{itinerary_code}} ({{trip_name}}, {{trip_dates}}).

Applicable cancellation charges, if any, follow our agreement: [review: insert your cancellation policy or reference the contract clause]. A final statement will be issued within [review: insert timeframe].

We hope to welcome your clients on a future programme.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Partner — rate sheet cover message',
    category: 'partner', subcategory: 'rates', channel: 'email',
    description: 'Accompanies a seasonal/updated rate sheet.',
    subject: '{{company_name}} — updated rates for your programmes',
    body: `Dear {{partner_name}},

Please find attached our updated rate sheet for {{partner_company}}.

Rates are per person, seasonally banded, and include all services listed per programme. Tour-leader policy and child reductions are noted on the sheet.

We're happy to build net rates for any custom itinerary — send us the outline and group size and we'll turn it around quickly.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Partner — availability response',
    category: 'partner', subcategory: 'reservation', channel: 'email',
    description: 'Reply to an availability request.',
    subject: 'Availability: {{trip_name}} — {{trip_dates}}',
    body: `Dear {{partner_name}},

Regarding your availability request for {{trip_name}} ({{trip_dates}}):

{{details}}

We can hold this as an option until [review: insert option deadline] — after that, availability is released without further notice. To convert the option into a firm booking, simply confirm in writing.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Partner — settlement reminder',
    category: 'partner', subcategory: 'payment', channel: 'email',
    description: 'Outstanding balance reminder to a partner.',
    subject: 'Statement reminder — {{itinerary_code}}',
    body: `Dear {{partner_name}},

A friendly reminder that the balance of {{balance}} for reservation {{itinerary_code}} ({{trip_name}}, departing {{start_date}}) remains outstanding.

Per our agreement, settlement is due before service delivery. Kindly arrange the transfer, or let us know if it has already been initiated so we can reconcile.

Best regards,
{{agent_name}}
{{company_name}}`,
  },

  // ── SUPPLIER ─────────────────────────────────────────────────────────────
  {
    name: 'Supplier — booking request',
    category: 'supplier', subcategory: 'reservation', channel: 'email',
    description: 'Request services from a hotel/cruise/transport supplier.',
    subject: 'Booking request — {{itinerary_code}} / {{trip_dates}}',
    body: `Dear {{supplier_name}} team,

We would like to request the following services for our file {{itinerary_code}}:

{{details}}

Guests: {{client_name}} party, {{trip_dates}}.

Kindly confirm availability and rate by return, quoting our reference. Rooming/passenger details will follow upon confirmation.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Supplier — voucher cover note',
    category: 'supplier', subcategory: 'voucher', channel: 'email',
    description: 'Accompanies the service voucher/order.',
    subject: 'Service voucher — {{itinerary_code}} / {{trip_dates}}',
    body: `Dear {{supplier_name}} team,

Please find attached our service voucher for file {{itinerary_code}} ({{trip_dates}}).

Kindly acknowledge receipt and confirm all details as per the voucher. Any discrepancy — dates, category, inclusions — please flag before the service date so we can resolve it together.

Thank you for the continued cooperation.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Supplier — amendment notice',
    category: 'supplier', subcategory: 'amendment', channel: 'email',
    description: 'Notify a supplier of a change to booked services.',
    subject: 'AMENDMENT — {{itinerary_code}} / {{trip_dates}}',
    body: `Dear {{supplier_name}} team,

Please note the following amendment to our booking {{itinerary_code}}:

{{details}}

All other arrangements remain unchanged. Kindly confirm the amendment by return, quoting our reference.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
  {
    name: 'Supplier — cancellation notice',
    category: 'supplier', subcategory: 'cancellation', channel: 'email',
    description: 'Cancel booked services with a supplier.',
    subject: 'CANCELLATION — {{itinerary_code}} / {{trip_dates}}',
    body: `Dear {{supplier_name}} team,

We regret to cancel the following services under our booking {{itinerary_code}} ({{trip_dates}}):

{{details}}

Kindly confirm the cancellation and any applicable charges as per our agreement by return.

Thank you for your understanding.

Best regards,
{{agent_name}}
{{company_name}}`,
  },
]

// ---------------------------------------------------------------------------
async function main() {
  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('id, company_name')
    .eq('company_name', TENANT_NAME)
    .single()
  if (tErr || !tenant) {
    console.error(`Tenant "${TENANT_NAME}" not found`)
    process.exit(1)
  }

  const { data: existing } = await admin
    .from('message_templates')
    .select('id, name')
    .eq('tenant_id', tenant.id)
  const byName = new Map((existing || []).map((t) => [t.name, t.id]))

  let created = 0
  let updated = 0
  for (const t of TEMPLATES) {
    const placeholders = extractPlaceholders(`${t.subject || ''} ${t.body}`)
    const row = {
      tenant_id: tenant.id,
      name: t.name,
      category: t.category,
      subcategory: t.subcategory,
      channel: t.channel,
      description: t.description,
      subject: t.subject,
      body: t.body,
      placeholders,
      language: 'en',
      is_active: true,
    }
    const existingId = byName.get(t.name)
    const action = existingId ? 'update' : 'create'
    console.log(`  ${APPLY ? '' : '[dry-run] '}${action}  ${t.category}/${t.subcategory}  ${t.name}  (${t.channel}, ${placeholders.length} placeholders)`)
    if (!APPLY) continue
    if (existingId) {
      const { error } = await admin.from('message_templates')
        .update({ category: row.category, subcategory: row.subcategory, channel: row.channel, description: row.description, subject: row.subject, body: row.body, placeholders: row.placeholders, language: row.language })
        .eq('id', existingId)
      if (error) { console.error(`  ✗ ${t.name}: ${error.message}`); process.exitCode = 1 } else updated++
    } else {
      const { error } = await admin.from('message_templates').insert(row)
      if (error) { console.error(`  ✗ ${t.name}: ${error.message}`); process.exitCode = 1 } else created++
    }
  }

  console.log(`\n${TEMPLATES.length} templates for "${tenant.company_name}" — ${APPLY ? `${created} created, ${updated} updated` : 'dry-run, nothing written (--apply to write)'}`)
  const marked = TEMPLATES.filter((t) => t.body.includes('[review:') || (t.subject || '').includes('[review:'))
  if (marked.length) {
    console.log(`\n⚠ ${marked.length} templates contain [review: …] markers — operator must fill their real policy/links before first use:`)
    for (const t of marked) console.log(`   - ${t.name}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
