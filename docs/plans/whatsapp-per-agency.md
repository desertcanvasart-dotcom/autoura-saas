# WhatsApp per agency: own numbers + message templates

**Status:** design agreed in discussion 2026-10-06, **paused** — waiting on the
four decisions below. Nothing built yet. Resume from "Next step".

## Why

- Meta lets a business number START a chat only with a pre-approved
  **template**; free text is allowed only for 24 h after the other side last
  wrote. Suppliers (drivers, guides, airport/hotel staff, restaurants) and
  customers therefore can't be messaged first with free text.
- Stop-gap shipped in #578: **"Send via my WhatsApp"** (wa.me link from the
  office's own phone, full assignment pre-typed). Stays as the fallback.

## Finding that shapes the plan

Each agency is meant to use **its own WhatsApp number**, but the code has
**one platform number** from env (`TWILIO_WHATSAPP_FROM` /
`META_WHATSAPP_PHONE_NUMBER_ID`, see `lib/whatsapp.ts`,
`lib/twilio-whatsapp.ts`, `lib/whatsapp-cloud-api.ts`). The webhook says so:
"the platform has ONE WhatsApp number and nothing maps it to a tenant"
(`app/api/whatsapp/webhook/route.ts`). Templates belong to a number's WhatsApp
Business Account (WABA), so **per-agency connection is step 0**.

## Design

### Step 0 — each agency connects its own number
- Settings → WhatsApp → Connect, via Meta **Embedded Signup** (Facebook login;
  agency picks/creates its WABA + number; no token copying).
- Recommended provider: **Meta Cloud API direct** (Meta path already exists;
  template API built in; messages billed to the agency's own Meta account).
- New table (sketch) `tenant_whatsapp_accounts`: tenant_id (unique), provider,
  waba_id, phone_number_id, display_phone, access_token (encrypted), status,
  quality_rating, connected_at.
- Outbound: `sendWhatsAppMessage` takes the tenant and uses its number/token.
- Inbound: webhook routes by `metadata.phone_number_id` → tenant (fixes the
  "no tenant found" gap).
- Prerequisite (slow, external): Autoura's Meta Business verified as a
  **Tech Provider** + Meta app review for WhatsApp permissions — weeks.

### Step 1 — ready-made template catalog, auto-submitted per agency
Agencies don't write templates; Autoura submits these to each agency's WABA on
connect (`POST /{waba_id}/message_templates`), **English + Arabic**, category
UTILITY:

| Template | For | Buttons |
|---|---|---|
| Staff assignment | drivers, guides, airport & hotel staff | Confirm · Can't make it · URL to staff check-in link |
| Assignment changed / cancelled | same | Confirm |
| Restaurant reservation request | restaurants | Confirmed · Not available |
| Booking confirmation | customers | — |
| Payment reminder | customers | URL to invoice |
| Trip reminder (day before) | customers | — |

Example (staff assignment):
> Hello {{1}}, {{2}} has a new assignment for you on {{3}}: {{4}} guests,
> client {{5}}. Notes: {{6}}  [Confirm] [Can't make it] [Open trip details]

- Per-agency status table (sketch) `tenant_whatsapp_templates`: tenant_id,
  template_key, language, meta name/id, status (pending/approved/rejected/
  paused), rejected_reason, last_synced_at. Kept current by Meta's
  `message_template_status_update` webhook.
- Settings → WhatsApp page: number, quality rating, template list with status,
  Resubmit, "Send a test to my phone".

### Step 2 — one tested function decides the route for every send
1. Recipient wrote to this agency's number within 24 h → free text (free).
2. Else template approved AND recipient opted in → template.
3. Else → "Send via my WhatsApp" fallback (already built).
Every send logged with template name + delivery status.

### Step 3 — button replies update the trip
Quick-reply payload carries the assignment id (e.g. `ASSIGN_CONFIRM:<id>`):
Confirm → assignment confirmed + trip timeline event; Can't make it → flagged
to the office. Any reply opens the 24 h window for free chat.

### Consent (Meta requirement)
"Agreed to receive WhatsApp messages" checkbox (+ when, how) on team members,
airport/hotel staff, suppliers, clients, and the manual-entry form. No consent
→ fallback route.

## Risks
- Meta onboarding time (Tech Provider + app review) is outside our control.
- Utility templates get rejected if they read as promotional — keep wording
  strictly transactional.
- A number on the API normally can't also be used in the WhatsApp phone app;
  Meta's "coexistence" may allow both — verify per agency.

## Open decisions (ask the user first)
1. Provider: **Meta direct** (recommended) or Twilio?
2. Is Autoura's Meta Business **verified**, and OK to register as a
   **Tech Provider**?
3. Fixed template catalog in v1 (recommended) or agency-editable wording?
4. Languages: English + Arabic to start, or more (French, Spanish…)?

## Next step
Get the four answers → start Tech Provider verification (user, in Meta
Business) in parallel with building step 0 (connect page, per-agency send,
inbound routing). Then step 1 → step 2/3 staff + restaurant → customer
templates.
