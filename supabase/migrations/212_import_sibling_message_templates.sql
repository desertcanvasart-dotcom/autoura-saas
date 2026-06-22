-- =====================================================================
-- Migration 212: Import message templates from travel-ops-pro
-- Description: Imports the sibling's customer / WhatsApp / internal-ops /
--              supplier message templates into our existing message_templates
--              system (same schema + {{PascalCase}} placeholders). Replaces
--              same-named templates (import-all, replace-dupes). Seeds for the
--              first tenant (mirrors migration 024). No schema changes.
-- Date: 2026-06-22
-- =====================================================================

DO $seedtpl$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenant found, skipping template seeding';
    RETURN;
  END IF;

  -- Replace dupes: remove existing same-named templates for this tenant (50 names)
  DELETE FROM message_templates WHERE tenant_id = v_tenant_id AND name IN (
    'Welcome / Inquiry Response',
    'Welcome / Inquiry Response (WhatsApp)',
    'Quotation Email',
    'Follow-Up After Quote',
    'Quote Expiry Reminder',
    'Booking Confirmation',
    'Deposit Received',
    'Final Payment Reminder',
    'Full Payment Received',
    'Pre-Trip Information Pack',
    'Travel Documents Sent',
    'Guide Introduction',
    'Thank You / Review Request',
    'Thank You (WhatsApp)',
    'Referral Request',
    'Itinerary Change Notification',
    'Weather / Safety Advisory',
    'Quotation (WhatsApp)',
    'Follow-Up After Quote (WhatsApp)',
    'Booking Confirmation (WhatsApp)',
    'Payment Reminder (WhatsApp)',
    'Pre-Trip Info (WhatsApp)',
    'Guide Introduction (WhatsApp)',
    'Itinerary Change (WhatsApp)',
    'Trip Handover Note',
    'Daily Operations Brief',
    'Supplier Issue Alert',
    'Supplier Issue Alert (WhatsApp)',
    'New Booking Notification',
    'New Booking (WhatsApp)',
    'Weekly Performance Summary',
    'Client Complaint Escalation',
    'Hotel Reservation Request',
    'Hotel Reservation - WhatsApp',
    'Transport Booking Request',
    'Transport Booking - WhatsApp',
    'Guide Assignment Request',
    'Guide Assignment - WhatsApp',
    'Nile Cruise Booking Request',
    'Nile Cruise Booking - WhatsApp',
    'General Service Order',
    'Service Order - WhatsApp',
    'Confirmation Request',
    'Confirmation Request - WhatsApp',
    'Payment Notice to Supplier',
    'Payment Notice - WhatsApp',
    'Booking Amendment Request',
    'Amendment Request - WhatsApp',
    'Booking Cancellation Notice',
    'Cancellation Notice - WhatsApp'
  );

  -- ===== Customer (email + whatsapp) =====
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Welcome / Inquiry Response',
  'First response to a new client inquiry. Sets expectations and shows professionalism.',
  'customer',
  'email',
  'Thank you for your inquiry — {{TourName}}',
  'Dear {{GuestName}},

Thank you for reaching out to us about your upcoming trip to Egypt!

We have received your inquiry and are already working on a personalized itinerary for you. Here is what we have noted so far:

• Travel dates: {{TripDates}}
• Number of travelers: {{PaxCount}}
• Destinations: {{Cities}}

Our team will prepare a detailed quotation with day-by-day activities, accommodation options, and transparent pricing. You can expect to hear from us within 24 hours.

In the meantime, feel free to reply to this email with any additional preferences or questions.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Welcome / Inquiry Response (WhatsApp)',
  'WhatsApp version of the inquiry response.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Thank you for your interest in traveling to Egypt!

We''ve noted your request:
📅 {{TripDates}}
👥 {{PaxCount}} travelers
📍 {{Cities}}

We''re preparing a personalized itinerary for you and will share it within 24 hours.

Feel free to send any additional preferences!

Best regards,
{{AgentName}} — {{CompanyName}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Quotation Email',
  'Send the prepared quotation/itinerary to the client with pricing details.',
  'customer',
  'email',
  'Your Personalized Itinerary — {{TourName}} | Ref: {{BookingRef}}',
  'Dear {{GuestName}},

Please find attached your personalized itinerary for {{TourName}}.

TRIP SUMMARY
• Dates: {{TripDates}} ({{Duration}} days)
• Travelers: {{PaxCount}}
• Service level: {{ServiceLevel}}
• Total price: {{Currency}} {{TotalPrice}}

The itinerary includes a day-by-day breakdown of activities, accommodation details, transportation arrangements, and all entrance fees.

WHAT IS INCLUDED
{{Inclusions}}

WHAT IS NOT INCLUDED
{{Exclusions}}

This quotation is valid for 7 days. To confirm your booking, a deposit of {{DepositAmount}} is required.

Please do not hesitate to ask if you would like any changes — we are happy to adjust the itinerary to match your preferences.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Follow-Up After Quote',
  'Gentle follow-up if the client has not responded to the quotation.',
  'customer',
  'email',
  'Following up on your Egypt trip — {{BookingRef}}',
  'Dear {{GuestName}},

I hope this email finds you well. I wanted to follow up on the itinerary we sent for {{TourName}}.

I understand planning a trip takes time, so please do not rush. I am writing to check if you have any questions, or if you would like us to adjust anything — whether it is the dates, accommodation level, activities, or budget.

We are happy to revise the itinerary at no extra cost until you are completely satisfied.

Looking forward to hearing from you.

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Quote Expiry Reminder',
  'Remind the client that their quotation is about to expire.',
  'customer',
  'email',
  'Your quotation expires soon — {{BookingRef}}',
  'Dear {{GuestName}},

This is a friendly reminder that your quotation for {{TourName}} (Ref: {{BookingRef}}) will expire in 3 days.

QUICK RECAP
• Dates: {{TripDates}}
• Travelers: {{PaxCount}}
• Total: {{Currency}} {{TotalPrice}}

After expiry, pricing may change due to hotel availability and seasonal rate adjustments.

To secure your booking at the current price, a deposit of {{DepositAmount}} is all that is needed. We can arrange flexible payment terms for the balance.

If you need more time or have questions, simply reply to this email.

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);

-- ============================================
-- BOOKING CONFIRMED
-- ============================================
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Booking Confirmation',
  'Confirm the booking after deposit or full payment is received.',
  'customer',
  'email',
  'Booking Confirmed! {{TourName}} — Ref: {{BookingRef}}',
  'Dear {{GuestName}},

Great news — your trip to Egypt is now confirmed!

BOOKING DETAILS
• Reference: {{BookingRef}}
• Tour: {{TourName}}
• Dates: {{TripDates}} ({{Duration}} days)
• Travelers: {{PaxCount}}
• Service level: {{ServiceLevel}}

PAYMENT STATUS
• Total cost: {{Currency}} {{TotalPrice}}
• Deposit received: {{Currency}} {{DepositAmount}}
• Balance due: {{Currency}} {{BalanceDue}} (by {{BalanceDueDate}})

WHAT HAPPENS NEXT
1. We will confirm all suppliers (hotels, guides, transport) within 48 hours
2. You will receive a detailed travel pack 7 days before departure
3. Your guide''s contact details will be shared 3 days before arrival

If you have any special requests — dietary needs, mobility considerations, celebration arrangements — please let us know now so we can make the necessary preparations.

We are excited to host you in Egypt!

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Deposit Received',
  'Acknowledge receipt of deposit payment.',
  'customer',
  'email',
  'Deposit received — {{BookingRef}}',
  'Dear {{GuestName}},

Thank you! We have received your deposit of {{Currency}} {{DepositAmount}} for {{TourName}}.

PAYMENT SUMMARY
• Booking reference: {{BookingRef}}
• Deposit received: {{Currency}} {{DepositAmount}}
• Remaining balance: {{Currency}} {{BalanceDue}}
• Balance due by: {{BalanceDueDate}}

A receipt is attached for your records.

We are now confirming all arrangements with our suppliers. You will receive a full booking confirmation shortly.

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Final Payment Reminder',
  'Remind the client that the balance payment is due.',
  'customer',
  'email',
  'Balance payment due — {{BookingRef}}',
  'Dear {{GuestName}},

This is a friendly reminder that the remaining balance for your upcoming trip is due by {{BalanceDueDate}}.

PAYMENT DETAILS
• Booking: {{BookingRef}} — {{TourName}}
• Travel dates: {{TripDates}}
• Balance due: {{Currency}} {{BalanceDue}}

{{PaymentInstructions}}

Once we receive your payment, we will send your complete travel documents including your detailed itinerary, hotel vouchers, and guide contact information.

If you have any questions about the payment, please do not hesitate to reach out.

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Full Payment Received',
  'Confirm that full payment has been received and the client is all set.',
  'customer',
  'email',
  'All set! Full payment received — {{BookingRef}}',
  'Dear {{GuestName}},

We have received your full payment for {{TourName}}. You are all set!

CONFIRMED BOOKING
• Reference: {{BookingRef}}
• Dates: {{TripDates}}
• Total paid: {{Currency}} {{TotalPrice}}

A receipt is attached for your records.

Your complete travel pack with the detailed itinerary, hotel vouchers, and emergency contacts will be sent to you 7 days before your departure.

We cannot wait to welcome you to Egypt!

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);

-- ============================================
-- PRE-TRIP
-- ============================================
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Pre-Trip Information Pack',
  'Comprehensive pre-trip information sent 7 days before departure.',
  'customer',
  'email',
  'Your trip starts in 7 days! Everything you need — {{BookingRef}}',
  'Dear {{GuestName}},

Your trip to Egypt is just 7 days away! Here is everything you need to know:

ARRIVAL DETAILS
• Date: {{StartDate}}
• Airport: Cairo International Airport (CAI)
• Our representative will meet you at arrivals with a sign bearing your name

YOUR GUIDE
• Name: {{GuideName}}
• Phone: {{GuidePhone}}
• Languages: {{GuideLanguages}}

ESSENTIAL INFORMATION
• Weather: Expect temperatures of 25-35°C. Light layers and sun protection recommended
• Currency: Egyptian Pound (EGP). USD and EUR widely accepted at hotels. ATMs available everywhere
• Visa: Available on arrival for most nationalities (approx. USD 25)
• Dress code: Modest clothing recommended for temple and mosque visits (shoulders and knees covered)
• Tipping: A local custom. Your guide will advise on appropriate amounts

WHAT TO PACK
• Comfortable walking shoes
• Sun hat and sunglasses
• Sunscreen (SPF 50+)
• Light scarf for mosque visits
• Camera with extra memory cards
• Power adapter (Type C, two-pin European)

Your detailed day-by-day itinerary is attached.

EMERGENCY CONTACTS
• 24/7 operations: {{CompanyPhone}}
• Your guide: {{GuidePhone}}
• Local emergency: 122 (police), 123 (ambulance)

Have a wonderful journey!

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Travel Documents Sent',
  'Notify client that all travel documents (itinerary, vouchers, contacts) have been sent.',
  'customer',
  'email',
  'Your travel documents are ready — {{BookingRef}}',
  'Dear {{GuestName}},

Your complete travel documents are attached to this email:

ATTACHED DOCUMENTS
1. Detailed day-by-day itinerary
2. Hotel vouchers
3. Transport confirmations
4. Emergency contact card

Please review everything and let us know if you have any questions before your departure on {{StartDate}}.

We recommend saving a copy of these documents on your phone for easy access during your trip.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Guide Introduction',
  'Introduce the assigned guide to the client before the trip.',
  'customer',
  'email',
  'Meet your guide for {{TourName}}',
  'Dear {{GuestName}},

We are pleased to introduce {{GuideName}}, who will be your personal guide during your trip.

ABOUT YOUR GUIDE
• Name: {{GuideName}}
• Languages: {{GuideLanguages}}
• Phone: {{GuidePhone}}

{{GuideName}} is one of our most experienced guides and will be with you throughout your journey. Feel free to contact them directly if you need anything upon arrival.

Your guide will meet you at {{MeetingPoint}} on {{StartDate}}.

We hope you have an incredible experience!

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);

-- ============================================
-- POST-TRIP
-- ============================================
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Thank You / Review Request',
  'Post-trip thank you email with a request for feedback.',
  'customer',
  'email',
  'Thank you for traveling with us, {{GuestName}}!',
  'Dear {{GuestName}},

Welcome home! We hope you had an unforgettable experience in Egypt.

It was a pleasure organizing your {{TourName}} trip ({{TripDates}}). We would love to hear about your highlights and any feedback you might have.

YOUR FEEDBACK MATTERS
If you have a moment, we would greatly appreciate a review. Your feedback helps us improve and helps other travelers plan their trips:

{{ReviewLink}}

If you have any photos you would like to share, we would love to feature them (with your permission) on our channels.

Thank you for choosing {{CompanyName}}. We hope to see you again!

Warm regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Thank You (WhatsApp)',
  'WhatsApp version of post-trip thank you.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 😊

Welcome home! We hope you had an amazing time in Egypt 🇪🇬

It was a real pleasure hosting you on your {{TourName}} trip. We''d love to hear how it went!

If you have a moment, a quick review would mean the world to us:
{{ReviewLink}}

Thank you for choosing {{CompanyName}} — we hope to see you again! 🙏

Best regards,
{{AgentName}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Referral Request',
  'Ask satisfied clients to refer friends and family.',
  'customer',
  'email',
  'Know someone planning a trip to Egypt?',
  'Dear {{GuestName}},

We hope the memories from your {{TourName}} trip are still fresh!

Many of our best clients come through personal recommendations. If you know anyone — friends, family, or colleagues — who is considering a trip to Egypt, we would be honored if you shared your experience with them.

They can reach us directly at {{CompanyPhone}} or {{CompanyEmail}}, and we will take the same care with their trip as we did with yours.

As a thank you for any referral, we will send you a special discount on your next trip with us.

Warm regards,
{{AgentName}}
{{CompanyName}}',
  true,
  NOW(),
  NOW()
);

-- ============================================
-- OPERATIONAL
-- ============================================
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Itinerary Change Notification',
  'Notify the client about a change to their itinerary.',
  'customer',
  'email',
  'Update to your itinerary — {{BookingRef}}',
  'Dear {{GuestName}},

We would like to inform you of a small adjustment to your itinerary for {{TourName}}.

CHANGE DETAILS
{{ChangeDescription}}

REASON
{{ChangeReason}}

This change does not affect the overall quality of your experience, and we believe you will enjoy the updated arrangement.

All other arrangements remain unchanged. Your updated itinerary is attached.

If you have any questions or concerns, please do not hesitate to reach out.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  NOW(),
  NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Weather / Safety Advisory',
  'Important travel advisory for upcoming trips.',
  'customer',
  'email',
  'Important information about your upcoming trip — {{BookingRef}}',
  'Dear {{GuestName}},

We are writing to share some important information regarding your upcoming trip on {{TripDates}}.

{{AdvisoryDetails}}

HOW THIS AFFECTS YOUR TRIP
{{TripImpact}}

WHAT WE ARE DOING
{{ActionsTaken}}

Your safety and comfort are our top priority. Please do not hesitate to contact us if you have any concerns.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  NOW(),
  NOW()
);


  -- ===== Customer WhatsApp + Internal ops =====
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Quotation (WhatsApp)',
  'Send quotation summary via WhatsApp with key details.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Your personalized itinerary for {{TourName}} is ready!

📋 *Trip Summary*
📅 {{TripDates}} ({{Duration}} days)
👥 {{PaxCount}} travelers
⭐ {{ServiceLevel}}
💰 {{Currency}} {{TotalPrice}}

I''ve sent the full day-by-day itinerary to your email with all the details.

This quote is valid for 7 days. To confirm, a deposit of {{DepositAmount}} is needed.

Let me know if you''d like any changes — happy to adjust! 😊

{{AgentName}} — {{CompanyName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Follow-Up After Quote (WhatsApp)',
  'Gentle WhatsApp follow-up after sending a quotation.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 😊

Just checking in about your {{TourName}} itinerary. Did you have a chance to review it?

Happy to answer any questions or make changes — no pressure at all!

{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Booking Confirmation (WhatsApp)',
  'Confirm booking via WhatsApp.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 🎉

Great news — your trip is *confirmed*!

✅ *{{TourName}}*
📅 {{TripDates}}
👥 {{PaxCount}} travelers
🔖 Ref: {{BookingRef}}

*What happens next:*
1️⃣ We confirm all suppliers within 48 hours
2️⃣ Travel pack sent 7 days before departure
3️⃣ Guide contact shared 3 days before arrival

If you have any special requests, let me know now! 🙏

{{AgentName}} — {{CompanyName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Payment Reminder (WhatsApp)',
  'Remind client about upcoming balance payment via WhatsApp.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Friendly reminder that your balance for {{TourName}} is due by {{BalanceDueDate}}.

💰 Balance: {{Currency}} {{BalanceDue}}
📅 Due by: {{BalanceDueDate}}

Once received, we''ll send your complete travel documents with itinerary, vouchers, and guide details.

Let me know if you need anything! 😊

{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Pre-Trip Info (WhatsApp)',
  'Pre-trip essentials sent via WhatsApp 7 days before departure.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} ✈️

Your trip starts in 7 days! Here are the essentials:

🧑‍✈️ *Your Guide*
{{GuideName}} — {{GuidePhone}}

📍 *Arrival*
{{StartDate}} at Cairo Airport (CAI)
Our rep will meet you at arrivals with your name sign

🌡️ *Weather:* 25-35°C — pack light layers + sunscreen
💵 *Currency:* Egyptian Pound. USD/EUR accepted at hotels
🛂 *Visa:* On arrival ~$25

📋 Full travel pack sent to your email!

See you soon! 🇪🇬

{{AgentName}} — {{CompanyName}}
📞 {{CompanyPhone}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Guide Introduction (WhatsApp)',
  'Introduce the guide to the client via WhatsApp.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Meet your guide for {{TourName}}!

🧑‍🏫 *{{GuideName}}*
📱 {{GuidePhone}}
🗣️ {{GuideLanguages}}

{{GuideName}} will meet you at {{MeetingPoint}} on {{StartDate}}.

Feel free to contact them directly if you need anything upon arrival.

Have an amazing trip! 🎉

{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Itinerary Change (WhatsApp)',
  'Notify client of an itinerary change via WhatsApp.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Quick update on your {{TourName}} trip:

📝 *Change:* {{ChangeDescription}}
📌 *Reason:* {{ChangeReason}}

Everything else stays the same. Updated itinerary sent to your email.

Let me know if you have any questions! 🙏

{{AgentName}}',
  true, NOW(), NOW()
);

-- ============================================
-- INTERNAL TEMPLATES
-- ============================================
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Trip Handover Note',
  'Internal handover when reassigning a booking to another team member.',
  'internal',
  'email',
  'Handover: {{BookingRef}} — {{GuestName}} ({{TripDates}})',
  'Hi Team,

I am handing over the following booking:

BOOKING DETAILS
• Reference: {{BookingRef}}
• Client: {{GuestName}}
• Dates: {{TripDates}}
• Travelers: {{PaxCount}}
• Tour: {{TourName}}

STATUS
• Payment: {{PaymentStatus}}
• Supplier confirmations: {{ConfirmationStatus}}

IMPORTANT NOTES
{{HandoverNotes}}

PENDING ACTIONS
{{PendingActions}}

Please review the itinerary and reach out to the client to introduce yourself.

Thanks,
{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Daily Operations Brief',
  'Morning brief summarizing active trips, arrivals, and departures for the day.',
  'internal',
  'email',
  'Daily Ops Brief — {{Date}}',
  'Good morning team,

Here is today''s operations summary:

ARRIVALS TODAY
{{ArrivalsToday}}

DEPARTURES TODAY
{{DeparturesToday}}

ACTIVE TRIPS
{{ActiveTrips}}

PENDING CONFIRMATIONS
{{PendingConfirmations}}

PAYMENTS DUE
{{PaymentsDue}}

NOTES / ALERTS
{{DailyNotes}}

Have a great day!
{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Supplier Issue Alert',
  'Internal alert when a supplier issue requires immediate attention.',
  'internal',
  'email',
  'ALERT: Supplier Issue — {{BookingRef}}',
  'URGENT — Supplier Issue

BOOKING: {{BookingRef}} — {{GuestName}} ({{TripDates}})

ISSUE
• Supplier: {{SupplierName}}
• Service: {{ServiceType}}
• Date: {{ServiceDate}}
• Problem: {{IssueDescription}}

IMPACT ON CLIENT
{{ClientImpact}}

RECOMMENDED ACTION
{{RecommendedAction}}

ALTERNATIVES AVAILABLE
{{Alternatives}}

Please respond ASAP.

{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Supplier Issue Alert (WhatsApp)',
  'Urgent WhatsApp alert for supplier issues requiring immediate attention.',
  'internal',
  'whatsapp',
  NULL,
  '🚨 *SUPPLIER ISSUE*

Booking: {{BookingRef}} — {{GuestName}}
📅 {{TripDates}}

⚠️ *Problem:*
{{SupplierName}} — {{IssueDescription}}

🎯 *Action needed:*
{{RecommendedAction}}

Please respond ASAP!

{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'New Booking Notification',
  'Notify the team when a new booking is confirmed.',
  'internal',
  'email',
  'New Booking Confirmed — {{BookingRef}}',
  'Team,

A new booking has been confirmed:

• Reference: {{BookingRef}}
• Client: {{GuestName}} ({{Nationality}})
• Tour: {{TourName}}
• Dates: {{TripDates}} ({{Duration}} days)
• Travelers: {{PaxCount}}
• Service level: {{ServiceLevel}}
• Value: {{Currency}} {{TotalPrice}}

NEXT STEPS
1. Confirm hotels and transport
2. Assign guide
3. Send booking confirmation to client

Assigned to: {{AgentName}}

Let''s make this a great trip!',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'New Booking (WhatsApp)',
  'Quick WhatsApp notification for new booking.',
  'internal',
  'whatsapp',
  NULL,
  '✅ *New Booking Confirmed*

🔖 {{BookingRef}}
👤 {{GuestName}} ({{Nationality}})
📅 {{TripDates}}
👥 {{PaxCount}} pax
⭐ {{ServiceLevel}}
💰 {{Currency}} {{TotalPrice}}

Next: Confirm suppliers + assign guide

{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Weekly Performance Summary',
  'Internal weekly summary of bookings, revenue, and key metrics.',
  'internal',
  'email',
  'Weekly Summary — Week of {{WeekStartDate}}',
  'Hi Team,

Here is this week''s performance summary:

BOOKINGS
• New inquiries: {{NewInquiries}}
• Quotes sent: {{QuotesSent}}
• Bookings confirmed: {{BookingsConfirmed}}
• Conversion rate: {{ConversionRate}}

REVENUE
• Total booked: {{Currency}} {{TotalBooked}}
• Payments received: {{Currency}} {{PaymentsReceived}}
• Outstanding: {{Currency}} {{Outstanding}}

OPERATIONS
• Trips completed: {{TripsCompleted}}
• Active trips: {{ActiveTrips}}
• Upcoming (next 7 days): {{UpcomingTrips}}

HIGHLIGHTS
{{WeeklyHighlights}}

AREAS TO WATCH
{{AreasToWatch}}

Great work, team!
{{AgentName}}',
  true, NOW(), NOW()
);
INSERT INTO message_templates (tenant_id, id, name, description, category, channel, subject, body, is_active, created_at, updated_at)
VALUES (v_tenant_id, 
  gen_random_uuid(),
  'Client Complaint Escalation',
  'Internal escalation when a client complaint needs management attention.',
  'internal',
  'email',
  'ESCALATION: Client Complaint — {{BookingRef}}',
  'ESCALATION — Client Complaint

BOOKING: {{BookingRef}}
CLIENT: {{GuestName}} ({{GuestEmail}}, {{GuestPhone}})
TOUR: {{TourName}} ({{TripDates}})

COMPLAINT DETAILS
{{ComplaintDescription}}

SERVICES AFFECTED
{{AffectedServices}}

ACTIONS TAKEN SO FAR
{{ActionsTaken}}

RECOMMENDED RESOLUTION
{{RecommendedResolution}}

FINANCIAL IMPACT
{{FinancialImpact}}

This requires management review. Please advise on next steps.

{{AgentName}}',
  true, NOW(), NOW()
);


  -- ===== Supplier =====
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Hotel Reservation Request',
  'Request a hotel reservation for guests',
  'supplier',
  'hotel_reservation',
  'email',
  'Reservation Request - {{GuestName}} - {{CheckInDate}} to {{CheckOutDate}}',
  'Dear {{HotelName}} Reservations Team,

We would like to request a reservation with the following details:

BOOKING DETAILS:
Guest Name: {{GuestName}}
Number of Guests: {{NumAdults}} Adults, {{NumChildren}} Children
Check-in: {{CheckInDate}}
Check-out: {{CheckOutDate}}
Number of Nights: {{NumNights}}
Room Type: {{RoomType}}

SPECIAL REQUESTS:
{{SpecialRequests}}

Please confirm availability and rate at your earliest convenience.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{HotelName}}', '{{GuestName}}', '{{NumAdults}}', '{{NumChildren}}', '{{CheckInDate}}', '{{CheckOutDate}}', '{{NumNights}}', '{{RoomType}}', '{{SpecialRequests}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- Hotel Reservation Request (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Hotel Reservation - WhatsApp',
  'Quick hotel reservation request via WhatsApp',
  'supplier',
  'hotel_reservation',
  'whatsapp',
  'Hello {{HotelName}},

New reservation request:

*Guest:* {{GuestName}}
*Dates:* {{CheckInDate}} - {{CheckOutDate}}
*Guests:* {{NumAdults}} adults, {{NumChildren}} children
*Room:* {{RoomType}}

Please confirm availability and rate.

Thank you,
{{SenderName}}',
  ARRAY['{{HotelName}}', '{{GuestName}}', '{{CheckInDate}}', '{{CheckOutDate}}', '{{NumAdults}}', '{{NumChildren}}', '{{RoomType}}', '{{SenderName}}']::text[],
  true
);

-- Transport Booking Request (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Transport Booking Request',
  'Request transport service from supplier',
  'supplier',
  'transport_booking',
  'email',
  'Transport Request - {{ServiceDate}} - {{GuestName}}',
  'Dear {{SupplierName}},

We would like to book transport services as follows:

SERVICE DETAILS:
Date: {{ServiceDate}}
Guest Name: {{GuestName}}
Number of Passengers: {{NumPassengers}}
Pickup Location: {{PickupLocation}}
Pickup Time: {{PickupTime}}
Drop-off Location: {{DropoffLocation}}
Vehicle Type: {{VehicleType}}

ADDITIONAL NOTES:
{{AdditionalNotes}}

Please confirm availability and provide a quote.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{SupplierName}}', '{{ServiceDate}}', '{{GuestName}}', '{{NumPassengers}}', '{{PickupLocation}}', '{{PickupTime}}', '{{DropoffLocation}}', '{{VehicleType}}', '{{AdditionalNotes}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- Transport Booking (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Transport Booking - WhatsApp',
  'Quick transport booking via WhatsApp',
  'supplier',
  'transport_booking',
  'whatsapp',
  'Hello {{SupplierName}},

Transport booking request:

*Date:* {{ServiceDate}}
*Guest:* {{GuestName}}
*Passengers:* {{NumPassengers}}
*From:* {{PickupLocation}} at {{PickupTime}}
*To:* {{DropoffLocation}}
*Vehicle:* {{VehicleType}}

Please confirm.

{{SenderName}}',
  ARRAY['{{SupplierName}}', '{{ServiceDate}}', '{{GuestName}}', '{{NumPassengers}}', '{{PickupLocation}}', '{{PickupTime}}', '{{DropoffLocation}}', '{{VehicleType}}', '{{SenderName}}']::text[],
  true
);

-- Guide Assignment Request (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Guide Assignment Request',
  'Request guide services for a tour',
  'supplier',
  'guide_assignment',
  'email',
  'Guide Assignment - {{TourName}} - {{ServiceDate}}',
  'Dear {{GuideName}},

We would like to assign you to the following tour:

TOUR DETAILS:
Tour Name: {{TourName}}
Date: {{ServiceDate}}
Duration: {{Duration}}
Meeting Point: {{MeetingPoint}}
Meeting Time: {{MeetingTime}}

GUEST INFORMATION:
Guest Name: {{GuestName}}
Number of Guests: {{NumGuests}}
Languages: {{Languages}}
Nationality: {{Nationality}}

ITINERARY:
{{Itinerary}}

SPECIAL NOTES:
{{SpecialNotes}}

Please confirm your availability.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{GuideName}}', '{{TourName}}', '{{ServiceDate}}', '{{Duration}}', '{{MeetingPoint}}', '{{MeetingTime}}', '{{GuestName}}', '{{NumGuests}}', '{{Languages}}', '{{Nationality}}', '{{Itinerary}}', '{{SpecialNotes}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- Guide Assignment (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Guide Assignment - WhatsApp',
  'Quick guide assignment via WhatsApp',
  'supplier',
  'guide_assignment',
  'whatsapp',
  'Hello {{GuideName}},

New assignment:

*Tour:* {{TourName}}
*Date:* {{ServiceDate}}
*Time:* {{MeetingTime}}
*Location:* {{MeetingPoint}}
*Guest:* {{GuestName}} ({{NumGuests}} pax)

Please confirm availability.

{{SenderName}}',
  ARRAY['{{GuideName}}', '{{TourName}}', '{{ServiceDate}}', '{{MeetingTime}}', '{{MeetingPoint}}', '{{GuestName}}', '{{NumGuests}}', '{{SenderName}}']::text[],
  true
);

-- Cruise Booking Request (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Nile Cruise Booking Request',
  'Request a Nile cruise booking',
  'supplier',
  'cruise_booking',
  'email',
  'Cruise Booking Request - {{CruiseName}} - {{BoardingDate}}',
  'Dear {{CruiseName}} Reservations,

We would like to request a cabin reservation:

BOOKING DETAILS:
Guest Name: {{GuestName}}
Boarding Date: {{BoardingDate}}
Disembarkation Date: {{DisembarkationDate}}
Route: {{CruiseRoute}}
Cabin Type: {{CabinType}}
Number of Cabins: {{NumCabins}}
Guests: {{NumAdults}} Adults, {{NumChildren}} Children

SPECIAL REQUESTS:
- Dietary Requirements: {{DietaryRequirements}}
- Special Occasions: {{SpecialOccasions}}
- Other: {{OtherRequests}}

Please confirm availability and provide the net rate.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{CruiseName}}', '{{GuestName}}', '{{BoardingDate}}', '{{DisembarkationDate}}', '{{CruiseRoute}}', '{{CabinType}}', '{{NumCabins}}', '{{NumAdults}}', '{{NumChildren}}', '{{DietaryRequirements}}', '{{SpecialOccasions}}', '{{OtherRequests}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- Cruise Booking (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Nile Cruise Booking - WhatsApp',
  'Quick cruise booking via WhatsApp',
  'supplier',
  'cruise_booking',
  'whatsapp',
  'Hello {{CruiseName}},

Cruise booking request:

*Guest:* {{GuestName}}
*Dates:* {{BoardingDate}} - {{DisembarkationDate}}
*Route:* {{CruiseRoute}}
*Cabin:* {{CabinType}} x {{NumCabins}}
*Guests:* {{NumAdults}} adults, {{NumChildren}} children

Please confirm availability and rate.

{{SenderName}}',
  ARRAY['{{CruiseName}}', '{{GuestName}}', '{{BoardingDate}}', '{{DisembarkationDate}}', '{{CruiseRoute}}', '{{CabinType}}', '{{NumCabins}}', '{{NumAdults}}', '{{NumChildren}}', '{{SenderName}}']::text[],
  true
);

-- Service Order (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'General Service Order',
  'General service order for any supplier',
  'supplier',
  'service_order',
  'email',
  'Service Order - {{ServiceType}} - {{ServiceDate}}',
  'Dear {{SupplierName}},

We would like to place the following service order:

ORDER DETAILS:
Reference: {{BookingRef}}
Service Type: {{ServiceType}}
Date: {{ServiceDate}}
Time: {{ServiceTime}}
Location: {{ServiceLocation}}

GUEST DETAILS:
Guest Name: {{GuestName}}
Number of Guests: {{NumGuests}}
Contact: {{GuestPhone}}

SERVICE DESCRIPTION:
{{ServiceDescription}}

SPECIAL REQUIREMENTS:
{{SpecialRequirements}}

Please confirm this order and provide the final cost.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{ServiceType}}', '{{ServiceDate}}', '{{ServiceTime}}', '{{ServiceLocation}}', '{{GuestName}}', '{{NumGuests}}', '{{GuestPhone}}', '{{ServiceDescription}}', '{{SpecialRequirements}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- Service Order (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Service Order - WhatsApp',
  'Quick service order via WhatsApp',
  'supplier',
  'service_order',
  'whatsapp',
  'Hello {{SupplierName}},

Service order:

*Ref:* {{BookingRef}}
*Service:* {{ServiceType}}
*Date:* {{ServiceDate}} at {{ServiceTime}}
*Location:* {{ServiceLocation}}
*Guest:* {{GuestName}} ({{NumGuests}} pax)

Please confirm.

{{SenderName}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{ServiceType}}', '{{ServiceDate}}', '{{ServiceTime}}', '{{ServiceLocation}}', '{{GuestName}}', '{{NumGuests}}', '{{SenderName}}']::text[],
  true
);

-- Confirmation Request (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Confirmation Request',
  'Request confirmation of a pending booking',
  'supplier',
  'confirmation_request',
  'email',
  'URGENT: Confirmation Request - Ref {{BookingRef}}',
  'Dear {{SupplierName}},

We are following up on our booking request and kindly request your confirmation.

BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
SERVICE DATE: {{ServiceDate}}
SERVICE TYPE: {{ServiceType}}

We need confirmation by {{ConfirmationDeadline}} to finalize arrangements with our client.

Please reply with:
1. Confirmation status
2. Final pricing
3. Any special instructions

Thank you for your prompt attention.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{GuestName}}', '{{ServiceDate}}', '{{ServiceType}}', '{{ConfirmationDeadline}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- Confirmation Request (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Confirmation Request - WhatsApp',
  'Urgent confirmation request via WhatsApp',
  'supplier',
  'confirmation_request',
  'whatsapp',
  'Hello {{SupplierName}},

Kindly confirm our booking:

*Ref:* {{BookingRef}}
*Guest:* {{GuestName}}
*Date:* {{ServiceDate}}
*Service:* {{ServiceType}}

Need confirmation by {{ConfirmationDeadline}}.

Thank you,
{{SenderName}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{GuestName}}', '{{ServiceDate}}', '{{ServiceType}}', '{{ConfirmationDeadline}}', '{{SenderName}}']::text[],
  true
);

-- Payment Notice (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Payment Notice to Supplier',
  'Notify supplier of upcoming or completed payment',
  'supplier',
  'payment_notice',
  'email',
  'Payment Notice - {{BookingRef}} - {{PaymentAmount}}',
  'Dear {{SupplierName}},

This is to inform you about a payment related to the following booking:

BOOKING DETAILS:
Reference: {{BookingRef}}
Guest Name: {{GuestName}}
Service Date: {{ServiceDate}}

PAYMENT INFORMATION:
Amount: {{PaymentAmount}} {{Currency}}
Payment Type: {{PaymentType}}
Payment Date: {{PaymentDate}}
Payment Method: {{PaymentMethod}}
Transaction Reference: {{TransactionRef}}

INVOICE/BOOKING DETAILS:
{{InvoiceDetails}}

Please confirm receipt of this payment notice.

Best regards,
{{SenderName}}
{{CompanyName}}
Accounts Department',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{GuestName}}', '{{ServiceDate}}', '{{PaymentAmount}}', '{{Currency}}', '{{PaymentType}}', '{{PaymentDate}}', '{{PaymentMethod}}', '{{TransactionRef}}', '{{InvoiceDetails}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- Payment Notice (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Payment Notice - WhatsApp',
  'Quick payment notification via WhatsApp',
  'supplier',
  'payment_notice',
  'whatsapp',
  'Hello {{SupplierName}},

Payment notification:

*Ref:* {{BookingRef}}
*Amount:* {{PaymentAmount}} {{Currency}}
*Date:* {{PaymentDate}}
*Type:* {{PaymentType}}

Please confirm receipt.

{{SenderName}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{PaymentAmount}}', '{{Currency}}', '{{PaymentDate}}', '{{PaymentType}}', '{{SenderName}}']::text[],
  true
);

-- Amendment Request (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Booking Amendment Request',
  'Request changes to an existing booking',
  'supplier',
  'amendment',
  'email',
  'Amendment Request - Ref {{BookingRef}} - {{GuestName}}',
  'Dear {{SupplierName}},

We need to request an amendment to the following confirmed booking:

ORIGINAL BOOKING:
Reference: {{BookingRef}}
Guest Name: {{GuestName}}
Original Date: {{OriginalDate}}
Original Service: {{OriginalService}}

REQUESTED CHANGES:
{{AmendmentDetails}}

NEW DETAILS:
{{NewDetails}}

REASON FOR CHANGE:
{{AmendmentReason}}

Please confirm if these changes can be accommodated and advise of any rate adjustments or penalties.

We apologize for any inconvenience caused.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{GuestName}}', '{{OriginalDate}}', '{{OriginalService}}', '{{AmendmentDetails}}', '{{NewDetails}}', '{{AmendmentReason}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- Amendment Request (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Amendment Request - WhatsApp',
  'Quick amendment request via WhatsApp',
  'supplier',
  'amendment',
  'whatsapp',
  'Hello {{SupplierName}},

Amendment request for:

*Ref:* {{BookingRef}}
*Guest:* {{GuestName}}

*Changes needed:*
{{AmendmentDetails}}

Please confirm if possible.

{{SenderName}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{GuestName}}', '{{AmendmentDetails}}', '{{SenderName}}']::text[],
  true
);

-- Cancellation Notice (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Booking Cancellation Notice',
  'Notify supplier of a booking cancellation',
  'supplier',
  'cancellation',
  'email',
  'CANCELLATION - Ref {{BookingRef}} - {{GuestName}}',
  'Dear {{SupplierName}},

We regret to inform you that we need to cancel the following booking:

BOOKING DETAILS:
Reference: {{BookingRef}}
Guest Name: {{GuestName}}
Service Date: {{ServiceDate}}
Service Type: {{ServiceType}}

REASON FOR CANCELLATION:
{{CancellationReason}}

CANCELLATION DATE: {{CancellationDate}}

Please confirm receipt of this cancellation and advise of any applicable cancellation charges per your terms and conditions.

We apologize for any inconvenience.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{GuestName}}', '{{ServiceDate}}', '{{ServiceType}}', '{{CancellationReason}}', '{{CancellationDate}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- Cancellation Notice (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Cancellation Notice - WhatsApp',
  'Quick cancellation notice via WhatsApp',
  'supplier',
  'cancellation',
  'whatsapp',
  'Hello {{SupplierName}},

Unfortunately, we need to cancel:

*Ref:* {{BookingRef}}
*Guest:* {{GuestName}}
*Date:* {{ServiceDate}}

*Reason:* {{CancellationReason}}

Please confirm cancellation and any charges.

Apologies for the inconvenience.

{{SenderName}}',
  ARRAY['{{SupplierName}}', '{{BookingRef}}', '{{GuestName}}', '{{ServiceDate}}', '{{CancellationReason}}', '{{SenderName}}']::text[],
  true
);

-- =====================================================
-- Add supplier-specific placeholders to template_placeholders table (if it exists)
-- =====================================================


  -- ===== Supplier placeholder registry =====
  INSERT INTO template_placeholders (tenant_id, placeholder, display_name, category, example_value)
VALUES
  (v_tenant_id, '{{SupplierName}}', 'Supplier Name', 'supplier', 'Pyramids Transport Co.'),
  (v_tenant_id, '{{SupplierEmail}}', 'Supplier Email', 'supplier', 'bookings@supplier.com'),
  (v_tenant_id, '{{SupplierPhone}}', 'Supplier Phone', 'supplier', '+20 123 456 7890'),
  (v_tenant_id, '{{SupplierWhatsApp}}', 'Supplier WhatsApp', 'supplier', '+20 123 456 7890'),
  (v_tenant_id, '{{HotelName}}', 'Hotel Name', 'supplier', 'Marriott Mena House'),
  (v_tenant_id, '{{CruiseName}}', 'Cruise Name', 'supplier', 'MS Oberoi Philae'),
  (v_tenant_id, '{{GuideName}}', 'Guide Name', 'supplier', 'Ahmed Hassan'),
  (v_tenant_id, '{{BookingRef}}', 'Booking Reference', 'booking', 'BKG-2026-0042'),
  (v_tenant_id, '{{ServiceDate}}', 'Service Date', 'booking', '15 March 2026'),
  (v_tenant_id, '{{ServiceTime}}', 'Service Time', 'booking', '09:00 AM'),
  (v_tenant_id, '{{ServiceType}}', 'Service Type', 'booking', 'Airport Transfer'),
  (v_tenant_id, '{{ServiceLocation}}', 'Service Location', 'booking', 'Cairo International Airport'),
  (v_tenant_id, '{{ServiceDescription}}', 'Service Description', 'booking', 'Private airport pickup with meet & greet'),
  (v_tenant_id, '{{PickupLocation}}', 'Pickup Location', 'transport', 'Four Seasons Hotel Cairo'),
  (v_tenant_id, '{{PickupTime}}', 'Pickup Time', 'transport', '08:00 AM'),
  (v_tenant_id, '{{DropoffLocation}}', 'Drop-off Location', 'transport', 'Giza Pyramids'),
  (v_tenant_id, '{{VehicleType}}', 'Vehicle Type', 'transport', 'Mercedes Viano'),
  (v_tenant_id, '{{NumPassengers}}', 'Number of Passengers', 'transport', '4'),
  (v_tenant_id, '{{CheckInDate}}', 'Check-in Date', 'hotel', '10 March 2026'),
  (v_tenant_id, '{{CheckOutDate}}', 'Check-out Date', 'hotel', '12 March 2026'),
  (v_tenant_id, '{{NumNights}}', 'Number of Nights', 'hotel', '2'),
  (v_tenant_id, '{{RoomType}}', 'Room Type', 'hotel', 'Deluxe Pyramid View'),
  (v_tenant_id, '{{BoardingDate}}', 'Boarding Date', 'cruise', '15 March 2026'),
  (v_tenant_id, '{{DisembarkationDate}}', 'Disembarkation Date', 'cruise', '19 March 2026'),
  (v_tenant_id, '{{CruiseRoute}}', 'Cruise Route', 'cruise', 'Luxor to Aswan'),
  (v_tenant_id, '{{CabinType}}', 'Cabin Type', 'cruise', 'Suite with Balcony'),
  (v_tenant_id, '{{NumCabins}}', 'Number of Cabins', 'cruise', '1'),
  (v_tenant_id, '{{TourName}}', 'Tour Name', 'tour', 'Full Day Pyramids & Sphinx'),
  (v_tenant_id, '{{Duration}}', 'Duration', 'tour', '8 hours'),
  (v_tenant_id, '{{MeetingPoint}}', 'Meeting Point', 'tour', 'Hotel Lobby'),
  (v_tenant_id, '{{MeetingTime}}', 'Meeting Time', 'tour', '08:30 AM'),
  (v_tenant_id, '{{Itinerary}}', 'Itinerary', 'tour', 'Pyramids - Sphinx - Lunch - Museum'),
  (v_tenant_id, '{{Languages}}', 'Languages', 'tour', 'English'),
  (v_tenant_id, '{{Nationality}}', 'Nationality', 'guest', 'American'),
  (v_tenant_id, '{{NumGuests}}', 'Number of Guests', 'guest', '4'),
  (v_tenant_id, '{{DietaryRequirements}}', 'Dietary Requirements', 'guest', 'Vegetarian'),
  (v_tenant_id, '{{SpecialOccasions}}', 'Special Occasions', 'guest', 'Honeymoon'),
  (v_tenant_id, '{{SpecialRequests}}', 'Special Requests', 'guest', 'Early check-in requested'),
  (v_tenant_id, '{{SpecialRequirements}}', 'Special Requirements', 'guest', 'Wheelchair accessible'),
  (v_tenant_id, '{{SpecialNotes}}', 'Special Notes', 'general', 'VIP guests - extra attention'),
  (v_tenant_id, '{{OtherRequests}}', 'Other Requests', 'general', 'Flowers in room'),
  (v_tenant_id, '{{AdditionalNotes}}', 'Additional Notes', 'general', 'Please provide water bottles'),
  (v_tenant_id, '{{PaymentAmount}}', 'Payment Amount', 'payment', '1,500.00'),
  (v_tenant_id, '{{Currency}}', 'Currency', 'payment', 'USD'),
  (v_tenant_id, '{{PaymentType}}', 'Payment Type', 'payment', 'Final Payment'),
  (v_tenant_id, '{{PaymentDate}}', 'Payment Date', 'payment', '1 March 2026'),
  (v_tenant_id, '{{PaymentMethod}}', 'Payment Method', 'payment', 'Bank Transfer'),
  (v_tenant_id, '{{TransactionRef}}', 'Transaction Reference', 'payment', 'TRX-2026-03-001'),
  (v_tenant_id, '{{InvoiceDetails}}', 'Invoice Details', 'payment', 'INV-2026-0042'),
  (v_tenant_id, '{{ConfirmationDeadline}}', 'Confirmation Deadline', 'booking', '5 March 2026'),
  (v_tenant_id, '{{OriginalDate}}', 'Original Date', 'amendment', '10 March 2026'),
  (v_tenant_id, '{{OriginalService}}', 'Original Service', 'amendment', 'Standard Room'),
  (v_tenant_id, '{{AmendmentDetails}}', 'Amendment Details', 'amendment', 'Change room type from Standard to Deluxe'),
  (v_tenant_id, '{{NewDetails}}', 'New Details', 'amendment', 'Deluxe Room with Nile View'),
  (v_tenant_id, '{{AmendmentReason}}', 'Amendment Reason', 'amendment', 'Guest preference'),
  (v_tenant_id, '{{CancellationReason}}', 'Cancellation Reason', 'cancellation', 'Change of travel plans'),
  (v_tenant_id, '{{CancellationDate}}', 'Cancellation Date', 'cancellation', '1 March 2026')
ON CONFLICT (tenant_id, placeholder) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  example_value = EXCLUDED.example_value;

  RAISE NOTICE 'Migration 212: imported % message templates for tenant %', 50, v_tenant_id;
END $seedtpl$;
