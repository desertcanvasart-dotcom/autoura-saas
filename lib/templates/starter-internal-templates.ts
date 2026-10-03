// ============================================
// Starter internal templates
// ============================================
// Messages between the agency's own team: handing a trip over, reporting an
// incident, and the debrief after a trip. Loaded by "Load starter templates"
// (POST /api/templates/starter) with the other sets.
//
// The send window fills {{team_member_name}} (the colleague picked) and the
// sender's {{agent_name}} / {{company_name}}; the trip and what happened are
// typed in.

import type { StarterTemplate } from './starter-customer-templates'

const t = (s: TemplateStringsArray, ...v: string[]) =>
  s.reduce((acc, part, i) => acc + part + (v[i] ?? ''), '').replace(/^\n/, '').replace(/\n\s*$/, '')

export const STARTER_INTERNAL_TEMPLATES: StarterTemplate[] = [
  // ---------- Handover ----------
  {
    name: 'Team — trip handover',
    description: 'Hands a trip over to a colleague: who, when, what is confirmed and what is still open.',
    category: 'internal',
    subcategory: 'handover',
    channel: 'email',
    subject: 'Handover: {{client_name}} — {{trip_name}} ({{itinerary_code}})',
    body: t`
Hi {{team_member_name}},

I'm handing over the following trip to you:

Client: {{client_name}}
Trip: {{trip_name}}
Dates: {{trip_dates}}
Reference: {{itinerary_code}}

Status and open items:
{{details}}

Next steps:
{{follow_up}}

Everything is in the system under the reference above. Call me if anything is unclear.

Thanks,
{{agent_name}}
`,
  },
  {
    name: 'Team — trip handover — WhatsApp',
    description: 'Short WhatsApp handover to a colleague.',
    category: 'internal',
    subcategory: 'handover',
    channel: 'whatsapp',
    subject: null,
    body: t`
Hi {{team_member_name}}, I'm handing over {{client_name}} ({{itinerary_code}}, {{trip_dates}}) to you. Open items: {{details}}. Full notes are in the system — call me with any questions.
`,
  },

  // ---------- Incident ----------
  {
    name: 'Team — incident report',
    description: 'Records an incident during a trip: what happened, what was done and what follows.',
    category: 'internal',
    subcategory: 'incident',
    channel: 'email',
    subject: 'Incident report: {{client_name}} ({{itinerary_code}}) — {{incident_time}}',
    body: t`
Hi {{team_member_name}},

Reporting an incident on a live trip.

Client: {{client_name}}
Reference: {{itinerary_code}}
When: {{incident_time}}
Where: {{pickup_location}}

What happened:
{{details}}

Actions taken:
{{actions_taken}}

Follow-up needed:
{{follow_up}}

{{agent_name}}
`,
  },
  {
    name: 'Team — urgent incident alert — WhatsApp',
    description: 'Immediate WhatsApp alert to a colleague or manager about an incident.',
    category: 'internal',
    subcategory: 'incident',
    channel: 'whatsapp',
    subject: null,
    body: t`
URGENT — {{client_name}} ({{itinerary_code}}): {{details}}
Done so far: {{actions_taken}}. Please call me as soon as you see this. — {{agent_name}}
`,
  },

  // ---------- Debrief ----------
  {
    name: 'Team — trip debrief',
    description: 'After the trip: what went well, what to improve, and supplier notes for next time.',
    category: 'internal',
    subcategory: 'debrief',
    channel: 'email',
    subject: 'Debrief: {{client_name}} — {{trip_name}} ({{itinerary_code}})',
    body: t`
Hi {{team_member_name}},

Debrief for the trip that has just ended:

Client: {{client_name}}
Trip: {{trip_name}}
Dates: {{trip_dates}}
Reference: {{itinerary_code}}

What went well:
{{details}}

What to improve, and supplier notes:
{{follow_up}}

{{agent_name}}
`,
  },
]
