// ============================================
// Starter supplier templates
// ============================================
// The messages an agency sends hotels, Nile cruises, transport companies and
// guides: rate and availability requests, bookings, and the voucher cover
// note. Loaded by "Load starter templates" (POST /api/templates/starter) with
// the customer set, as ordinary editable templates.
//
// The send window fills {{supplier_name}} from the supplier picked and the
// agency's own {{company_*}} / {{agent_name}}; the booking specifics — guest,
// dates, rooms, pickup — are fields the sender types in. Nothing here names a
// company or a price.

import type { StarterTemplate } from './starter-customer-templates'

const t = (s: TemplateStringsArray, ...v: string[]) =>
  s.reduce((acc, part, i) => acc + part + (v[i] ?? ''), '').replace(/^\n/, '').replace(/\n\s*$/, '')

const SIGN_OFF = `Kind regards,
{{agent_name}}
{{company_name}}
{{company_phone}}`

export const STARTER_SUPPLIER_TEMPLATES: StarterTemplate[] = [
  // ---------- Hotels ----------
  {
    name: 'Hotel — rate and availability request',
    description: 'Asks a hotel for availability and its best rate before quoting a client.',
    category: 'supplier',
    subcategory: 'rate_request',
    channel: 'email',
    subject: 'Availability and rate request — {{check_in}} to {{check_out}}',
    body: t`
Dear {{supplier_name}} reservations team,

We'd like to check availability and your best rate for:

Check-in: {{check_in}}
Check-out: {{check_out}}
Guests: {{num_guests}}
Rooms: {{room_details}}
Meal plan: {{meal_plan}}

Please include your cancellation policy and how long you can hold the rooms.

${SIGN_OFF}
`,
  },
  {
    name: 'Hotel — booking request',
    description: 'Confirms a booking with a hotel after the client accepts.',
    category: 'supplier',
    subcategory: 'booking_request',
    channel: 'email',
    subject: 'Booking request — {{guest_name}}, {{check_in}} to {{check_out}} ({{itinerary_code}})',
    body: t`
Dear {{supplier_name}} reservations team,

Please book the following and send us your confirmation number:

Guest name: {{guest_name}}
Check-in: {{check_in}}
Check-out: {{check_out}}
Guests: {{num_guests}}
Rooms: {{room_details}}
Meal plan: {{meal_plan}}
Our reference: {{itinerary_code}}

Special requests: {{details}}

${SIGN_OFF}
`,
  },
  {
    name: 'Hotel — booking request — WhatsApp',
    description: 'Short WhatsApp booking request to a hotel.',
    category: 'supplier',
    subcategory: 'booking_request',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hello {{supplier_name}}, this is {{agent_name}} from {{company_name}}. Please book: {{guest_name}}, {{num_guests}} guests, {{room_details}}, {{check_in}} to {{check_out}} (ref {{itinerary_code}}).
Could you send the confirmation number? Thank you!
`,
  },
  {
    name: 'Hotel — voucher',
    description: 'Cover note for the hotel voucher sent before the guests arrive.',
    category: 'supplier',
    subcategory: 'hotel_voucher',
    channel: 'email',
    subject: 'Hotel voucher — {{guest_name}}, arriving {{check_in}} ({{itinerary_code}})',
    body: t`
Dear {{supplier_name}} team,

Please find attached the voucher for our guests:

Guest name: {{guest_name}}
Check-in: {{check_in}}
Check-out: {{check_out}}
Rooms: {{room_details}}
Our reference: {{itinerary_code}}

Notes: {{details}}

Thank you for taking good care of them. Please reply to confirm you've received this voucher.

${SIGN_OFF}
`,
  },

  // ---------- Nile cruises ----------
  {
    name: 'Cruise — cabin hold request',
    description: 'Asks a Nile cruise to hold cabins while the client decides.',
    category: 'supplier',
    subcategory: 'cruise_hold',
    channel: 'email',
    subject: 'Cabin hold request — sailing {{check_in}}',
    body: t`
Dear {{supplier_name}} reservations team,

Could you please hold the following for us, and let us know until when the hold is valid?

Embarkation: {{check_in}}
Disembarkation: {{check_out}}
Guests: {{num_guests}}
Cabins: {{room_details}}

We'll confirm as soon as our client decides.

${SIGN_OFF}
`,
  },
  {
    name: 'Cruise — voucher',
    description: 'Cover note for the cruise voucher.',
    category: 'supplier',
    subcategory: 'cruise_voucher',
    channel: 'email',
    subject: 'Cruise voucher — {{guest_name}}, embarking {{check_in}} ({{itinerary_code}})',
    body: t`
Dear {{supplier_name}} team,

Please find attached the voucher for:

Guest name: {{guest_name}}
Embarkation: {{check_in}}
Disembarkation: {{check_out}}
Cabins: {{room_details}}
Our reference: {{itinerary_code}}

Notes: {{details}}

Please reply to confirm receipt.

${SIGN_OFF}
`,
  },

  // ---------- Transport ----------
  {
    name: 'Transport — booking request',
    description: 'Books a vehicle and driver for a transfer or a day of touring.',
    category: 'supplier',
    subcategory: 'transport_booking',
    channel: 'email',
    subject: 'Transport booking — {{service_date}} ({{itinerary_code}})',
    body: t`
Dear {{supplier_name}},

Please book the following and confirm the driver's name and phone number:

Date: {{service_date}}
Pickup time: {{pickup_time}}
From: {{pickup_location}}
To: {{dropoff_location}}
Guests: {{num_guests}} ({{guest_name}})
Vehicle: {{vehicle_type}}
Our reference: {{itinerary_code}}

Notes: {{details}}

${SIGN_OFF}
`,
  },
  {
    name: 'Transport — booking request — WhatsApp',
    description: 'Short WhatsApp transport booking.',
    category: 'supplier',
    subcategory: 'transport_booking',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hello {{supplier_name}}, {{agent_name}} from {{company_name}}. Please book a {{vehicle_type}} on {{service_date}} at {{pickup_time}}, from {{pickup_location}} to {{dropoff_location}}, for {{num_guests}} guests ({{guest_name}}, ref {{itinerary_code}}).
Please send me the driver's name and number. Thank you!
`,
  },
  {
    name: 'Transport — voucher',
    description: 'Cover note for the transport voucher.',
    category: 'supplier',
    subcategory: 'transport_voucher',
    channel: 'email',
    subject: 'Transport voucher — {{guest_name}}, {{service_date}} ({{itinerary_code}})',
    body: t`
Dear {{supplier_name}},

Please find attached the transport voucher for {{guest_name}} on {{service_date}} (our reference {{itinerary_code}}).

Pickup: {{pickup_time}} at {{pickup_location}}

Please share the driver's name and phone number before the service date.

${SIGN_OFF}
`,
  },

  // ---------- Guides ----------
  {
    name: 'Guide — booking request',
    description: "Asks a guide for their availability on the client's dates.",
    category: 'supplier',
    subcategory: 'guide_booking',
    channel: 'email',
    subject: 'Guiding request — {{service_date}} ({{itinerary_code}})',
    body: t`
Dear {{supplier_name}},

Are you available to guide our guests?

Date: {{service_date}}
Language: {{guide_language}}
Guests: {{num_guests}} ({{guest_name}})
Programme: {{details}}
Meeting time and place: {{pickup_time}}, {{pickup_location}}
Our reference: {{itinerary_code}}

Please confirm your availability.

${SIGN_OFF}
`,
  },
  {
    name: 'Guide — booking request — WhatsApp',
    description: 'Short WhatsApp guiding request.',
    category: 'supplier',
    subcategory: 'guide_booking',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hello {{supplier_name}}, {{agent_name}} from {{company_name}} here. Are you free on {{service_date}} to guide {{num_guests}} guests in {{guide_language}}? Programme: {{details}}. Meeting {{pickup_time}} at {{pickup_location}} (ref {{itinerary_code}}).
`,
  },
  {
    name: 'Guide — assignment confirmation',
    description: 'Confirms the assignment to the guide, with the full programme attached.',
    category: 'supplier',
    subcategory: 'guide_voucher',
    channel: 'email',
    subject: 'Guide assignment confirmed — {{guest_name}}, {{service_date}} ({{itinerary_code}})',
    body: t`
Dear {{supplier_name}},

Thank you for confirming. Please find the assignment attached:

Guests: {{guest_name}} ({{num_guests}})
Date: {{service_date}}
Language: {{guide_language}}
Meeting: {{pickup_time}} at {{pickup_location}}
Our reference: {{itinerary_code}}

Notes: {{details}}

${SIGN_OFF}
`,
  },
]
