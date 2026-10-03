// ============================================
// Starter customer templates
// ============================================
// A new agency's Message Templates page is empty. "Load starter templates"
// (POST /api/templates/starter) adds these — the customer journey from first
// enquiry to after the trip — as ordinary templates the agency then edits or
// deletes. Placeholders are the ones the send flow fills for a client
// (app/api/clients/[id]/template-data): nothing here names a company, a
// country's bank or a fixed price.

export interface StarterTemplate {
  name: string
  description: string
  category: 'customer' | 'supplier' | 'partner' | 'internal'
  subcategory: string
  channel: 'email' | 'whatsapp'
  subject: string | null
  body: string
}

const t = (s: TemplateStringsArray, ...v: string[]) =>
  s.reduce((acc, part, i) => acc + part + (v[i] ?? ''), '').replace(/^\n/, '').replace(/\n\s*$/, '')

export const STARTER_CUSTOMER_TEMPLATES: StarterTemplate[] = [
  // 1. Lead response
  {
    name: 'Thank you for your enquiry',
    description: 'First reply to a new enquiry: thanks the client and asks for the details needed to prepare a proposal.',
    category: 'customer',
    subcategory: 'lead_response',
    channel: 'email',
    subject: 'Your trip enquiry — thank you, {{client_first_name}}',
    body: t`
Dear {{client_first_name}},

Thank you for contacting {{company_name}}. I'm {{agent_name}}, and I'll be looking after your enquiry personally.

To prepare a programme that fits you exactly, could you tell me:
• Your preferred travel dates
• How many travellers (adults and children)
• The places you'd most like to see
• Your preferred style: comfortable, deluxe or luxury

I'll come back to you with a tailored proposal within 24 hours.

Warm regards,
{{agent_name}}
{{company_name}}
`,
  },
  {
    name: 'Thank you for your enquiry — WhatsApp',
    description: 'Short WhatsApp version of the first reply to a new enquiry.',
    category: 'customer',
    subcategory: 'lead_response',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hello {{client_first_name}}, thank you for contacting {{company_name}}! I'm {{agent_name}} and I'll help you plan your trip.
Could you share your travel dates, the number of travellers and the places you'd like to see? I'll send you a tailored proposal within 24 hours.
`,
  },

  // 2. Quotation
  {
    name: 'Your quotation',
    description: 'Sends the quotation: a short summary of the trip and the price, and what happens next.',
    category: 'customer',
    subcategory: 'quotation',
    channel: 'email',
    subject: 'Your proposal: {{trip_name}}',
    body: t`
Dear {{client_first_name}},

Thank you for your patience. Please find your proposal for {{trip_name}} attached.

Trip: {{trip_name}}
Dates: {{trip_dates}} ({{total_days}})
Total price: {{total}}

Everything included is listed in the proposal. If you'd like to change anything — hotels, the pace, an extra day somewhere — just tell me and I'll adjust it.

When you're happy with the programme, reply to this email and I'll reserve everything for you.

Warm regards,
{{agent_name}}
{{company_name}}
`,
  },

  // 3. Deposit request
  {
    name: 'Deposit request',
    description: 'After the client accepts: the deposit amount and due date that secure the booking.',
    category: 'customer',
    subcategory: 'deposit_request',
    channel: 'email',
    subject: 'Securing your trip: deposit for {{trip_name}}',
    body: t`
Dear {{client_first_name}},

Wonderful news — we're ready to reserve {{trip_name}} ({{trip_dates}}) for you.

To confirm the booking, a deposit of {{deposit}} is due by {{deposit_due_date}}. The remaining balance of {{balance}} is due by {{final_payment_due}}.

Your booking reference is {{itinerary_code}}; please quote it with your payment. Our payment details are on the attached invoice.

As soon as the deposit arrives, I'll send your booking confirmation.

Warm regards,
{{agent_name}}
{{company_name}}
`,
  },
  {
    name: 'Deposit request — WhatsApp',
    description: 'Short WhatsApp reminder of the deposit that confirms the booking.',
    category: 'customer',
    subcategory: 'deposit_request',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hello {{client_first_name}}, we're ready to reserve {{trip_name}} for you!
To confirm, the deposit of {{deposit}} is due by {{deposit_due_date}} (reference {{itinerary_code}}). I've emailed you the invoice with our payment details.
`,
  },

  // 4. Booking confirmation
  {
    name: 'Booking confirmed',
    description: 'After the deposit: confirms the booking, the dates and the remaining balance.',
    category: 'customer',
    subcategory: 'booking_confirmation',
    channel: 'email',
    subject: 'Booking confirmed: {{trip_name}} ({{itinerary_code}})',
    body: t`
Dear {{client_first_name}},

Thank you — we've received your deposit and your trip is confirmed!

Booking reference: {{itinerary_code}}
Trip: {{trip_name}}
Dates: {{trip_dates}}
Balance due: {{balance}} by {{final_payment_due}}

A few days before you travel, I'll send you your final programme with meeting details and contact numbers.

If anything comes up in the meantime, I'm here to help.

Warm regards,
{{agent_name}}
{{company_name}}
`,
  },
  {
    name: 'Booking confirmed — WhatsApp',
    description: 'Short WhatsApp confirmation that the deposit arrived and the trip is booked.',
    category: 'customer',
    subcategory: 'booking_confirmation',
    channel: 'whatsapp',
    subject: null,
    body: t`
Great news, {{client_first_name}}! Your deposit has arrived and {{trip_name}} ({{trip_dates}}) is confirmed. Your booking reference is {{itinerary_code}}.
I've emailed you the full confirmation. Message me here any time.
`,
  },

  // 5. Day before
  {
    name: 'See you tomorrow',
    description: 'The day before arrival: what happens on landing and who to call.',
    category: 'customer',
    subcategory: 'day_before',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hello {{client_first_name}}, we're looking forward to welcoming you tomorrow!
Our representative will meet you on arrival holding a sign with your name. If anything changes with your flight, or you need us at any time, call or message us on {{company_phone}}.
Safe travels!
`,
  },

  // 6. Check-in
  {
    name: 'Welcome — first morning check-in',
    description: 'First day of the trip: a welcome and a reminder that help is a message away.',
    category: 'customer',
    subcategory: 'check_in',
    channel: 'whatsapp',
    subject: null,
    body: t`
Good morning {{client_first_name}}, and welcome! We hope you arrived well and slept comfortably.
If there's anything at all you need during your trip, just message me here — day or night.
`,
  },

  // 7. Post trip
  {
    name: 'Thank you for travelling with us',
    description: 'A few days after the trip: thanks the client and asks for a review.',
    category: 'customer',
    subcategory: 'post_trip',
    channel: 'email',
    subject: 'Thank you for travelling with {{company_name}}',
    body: t`
Dear {{client_first_name}},

Welcome home! Thank you for choosing {{company_name}} for {{trip_name}}. We hope it was everything you hoped for.

We'd love to hear how it went — what you enjoyed most, and anything we could do even better. A short review would mean a great deal to our small team and helps other travellers find us.

Whenever you're ready for your next journey, I'd be delighted to plan it with you.

Warm regards,
{{agent_name}}
{{company_name}}
`,
  },
  {
    name: 'Thank you for travelling with us — WhatsApp',
    description: 'Short WhatsApp thank-you after the trip.',
    category: 'customer',
    subcategory: 'post_trip',
    channel: 'whatsapp',
    subject: null,
    body: t`
Welcome home, {{client_first_name}}! Thank you for travelling with {{company_name}} — we hope you had a wonderful trip.
We'd love to hear how it went, and a short review would mean a lot to us. 🙏
`,
  },
]
