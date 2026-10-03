// ============================================
// Starter B2B partner templates
// ============================================
// The messages a land operator sends the agencies and tour operators that
// sell its trips: introductions, rate sheets, group quotations and
// confirmations, payment and commission. Loaded by "Load starter templates"
// (POST /api/templates/starter) with the customer and supplier sets.
//
// The send window fills {{partner_name}} (the partner's contact person) and
// {{partner_company}} from the partner picked, and the agency's own
// {{company_*}} / {{agent_name}}; the group, dates and amounts are typed in.

import type { StarterTemplate } from './starter-customer-templates'

const t = (s: TemplateStringsArray, ...v: string[]) =>
  s.reduce((acc, part, i) => acc + part + (v[i] ?? ''), '').replace(/^\n/, '').replace(/\n\s*$/, '')

const SIGN_OFF = `Best regards,
{{agent_name}}
{{company_name}}
{{company_phone}} · {{company_email}}`

export const STARTER_PARTNER_TEMPLATES: StarterTemplate[] = [
  // ---------- Partnership ----------
  {
    name: 'Partner — introduction',
    description: 'First approach to an agency or tour operator you would like to work with.',
    category: 'partner',
    subcategory: 'partnership',
    channel: 'email',
    subject: 'Ground services for your clients — {{company_name}}',
    body: t`
Dear {{partner_name}},

I'm {{agent_name}} from {{company_name}}. We're a local operator handling the full ground arrangements for agencies and tour operators: hotels, Nile cruises, guides, transport and private touring, with our own team on the ground and support around the clock.

I'd be glad to send you our current rates and a few sample programmes for {{partner_company}}'s clients. Would a short call next week suit you?

${SIGN_OFF}
`,
  },
  {
    name: 'Partner — welcome',
    description: 'Welcomes a new partner and explains how to request quotes and bookings.',
    category: 'partner',
    subcategory: 'partnership',
    channel: 'email',
    subject: 'Welcome to {{company_name}}, {{partner_company}}',
    body: t`
Dear {{partner_name}},

Thank you for choosing to work with us — we're delighted to welcome {{partner_company}} as a partner.

How we'll work together:
• Quotation requests: send the travel dates, group size, hotel category and any special interests, and we reply within one working day.
• Bookings: we confirm each service in writing and send vouchers before arrival.
• On the ground: your clients have our 24/7 number throughout their stay.

I'm your direct contact for anything you need.

${SIGN_OFF}
`,
  },

  // ---------- Rate sheet ----------
  {
    name: 'Partner — rate sheet',
    description: 'Cover note for your net rate sheet for a season.',
    category: 'partner',
    subcategory: 'rate_sheet',
    channel: 'email',
    subject: 'Our {{season}} rates for {{partner_company}}',
    body: t`
Dear {{partner_name}},

Please find attached our rate sheet for {{season}}, valid until {{valid_until}}.

The rates are net and per person, by group size; the sheet lists what is included and excluded. For programmes not on the sheet, send us the itinerary and we'll quote it.

${SIGN_OFF}
`,
  },
  {
    name: 'Partner — rate sheet — WhatsApp',
    description: 'Short WhatsApp note that the new rate sheet has been emailed.',
    category: 'partner',
    subcategory: 'rate_sheet',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hello {{partner_name}}, {{agent_name}} from {{company_name}}. I've just emailed you our {{season}} rate sheet, valid until {{valid_until}}. Any questions, message me here.
`,
  },

  // ---------- Group quotations ----------
  {
    name: 'Partner — quotation',
    description: "Replies to a partner's request with the group quotation.",
    category: 'partner',
    subcategory: 'partner_quote',
    channel: 'email',
    subject: 'Quotation: {{trip_name}} — {{group_name}}',
    body: t`
Dear {{partner_name}},

Thank you for your request. Please find our quotation attached:

Group: {{group_name}}
Programme: {{trip_name}}
Dates: {{trip_dates}}
Group size: {{num_guests}}
Net price: {{total}}

Notes: {{details}}

The quotation is subject to availability at the time of booking. Let me know if you'd like to adjust hotels, the pace or the services.

${SIGN_OFF}
`,
  },
  {
    name: 'Partner — quotation received — WhatsApp',
    description: "Acknowledges a partner's quotation request on WhatsApp.",
    category: 'partner',
    subcategory: 'partner_quote',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hello {{partner_name}}, thank you for the request for {{group_name}} ({{trip_dates}}). We're preparing the quotation and will send it within one working day.
`,
  },
  {
    name: 'Partner — booking confirmed',
    description: "Confirms a partner's group booking with the reference and what happens next.",
    category: 'partner',
    subcategory: 'partner_quote',
    channel: 'email',
    subject: 'Booking confirmed: {{group_name}} ({{itinerary_code}})',
    body: t`
Dear {{partner_name}},

Thank you — the booking for {{group_name}} is confirmed.

Our reference: {{itinerary_code}}
Programme: {{trip_name}}
Dates: {{trip_dates}}
Group size: {{num_guests}}
Total: {{total}}

Please send the final rooming list and flight details at least 14 days before arrival. Vouchers and the final programme will follow.

${SIGN_OFF}
`,
  },

  // ---------- Payment and commission ----------
  {
    name: 'Partner — payment request',
    description: 'Asks a partner to settle the invoice for a group.',
    category: 'partner',
    subcategory: 'commission_statement',
    channel: 'email',
    subject: 'Payment due: {{group_name}} ({{itinerary_code}})',
    body: t`
Dear {{partner_name}},

Please find attached our invoice for {{group_name}} ({{trip_dates}}), reference {{itinerary_code}}.

Amount due: {{total}}
Due date: {{due_date}}

Our bank details are on the invoice. Please quote the reference with your transfer.

${SIGN_OFF}
`,
  },
  {
    name: 'Partner — commission statement',
    description: 'Cover note for the commission statement for a period.',
    category: 'partner',
    subcategory: 'commission_statement',
    channel: 'email',
    subject: 'Commission statement — {{statement_period}}',
    body: t`
Dear {{partner_name}},

Please find attached {{partner_company}}'s commission statement for {{statement_period}}.

Total commission: {{commission_amount}}

If anything doesn't match your records, let me know and we'll go through it together.

Thank you for the bookings this period.

${SIGN_OFF}
`,
  },
]
