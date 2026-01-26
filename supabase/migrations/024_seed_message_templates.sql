-- ============================================
-- MIGRATION 024: SEED MESSAGE TEMPLATES
-- ============================================
-- Adds default message templates for all categories
-- Created: 2026-01-25
-- ============================================

-- Helper function to get first tenant (for seeding)
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Get the first tenant
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenant found, skipping template seeding';
    RETURN;
  END IF;

  -- ============================================
  -- CUSTOMER TEMPLATES (B2C Travelers)
  -- ============================================

  -- Lead Response
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Initial Lead Response',
    'First response to a new travel inquiry',
    'customer',
    'lead_response',
    'email',
    'Thank you for your Egypt travel inquiry - {{CompanyName}}',
    'Dear {{GuestName}},

Thank you for your interest in visiting Egypt! We received your inquiry and are excited to help you plan an unforgettable journey.

Based on your initial request, I will prepare a personalized itinerary for you. In the meantime, could you please confirm:

1. Travel dates: {{StartDate}} to {{EndDate}}
2. Number of travelers: {{NumTravelers}}
3. Any specific interests (history, adventure, relaxation)?
4. Budget range per person

I will get back to you within 24 hours with a tailored proposal.

Warm regards,
{{AgentName}}
{{CompanyName}}
{{AgentPhone}}',
    ARRAY['{{GuestName}}', '{{CompanyName}}', '{{StartDate}}', '{{EndDate}}', '{{NumTravelers}}', '{{AgentName}}', '{{AgentPhone}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Quotation Email
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Quotation Email',
    'Send detailed tour quotation to client',
    'customer',
    'quotation',
    'email',
    'Your Egypt Tour Quotation - {{TourName}}',
    'Dear {{GuestName}},

Thank you for considering us for your Egypt adventure! Please find below your personalized tour quotation:

**{{TourName}}**
Duration: {{Duration}} days / {{Nights}} nights
Dates: {{StartDate}} - {{EndDate}}
Travelers: {{NumTravelers}} persons

**Price: {{TotalPrice}} per person**
(Based on {{NumTravelers}} travelers sharing)

**Tour Highlights:**
{{TourHighlights}}

**Included:**
- All accommodations ({{AccommodationType}})
- Private air-conditioned vehicle
- English-speaking Egyptologist guide
- All entrance fees as per itinerary
- Daily breakfast, selected meals
- Airport transfers

**Not Included:**
- International flights
- Travel insurance
- Personal expenses
- Optional tips

This quotation is valid until {{ValidUntil}}.

To proceed, we require a {{DepositAmount}} deposit. The remaining balance is due 30 days before departure.

Please let me know if you have any questions or would like to make adjustments.

Best regards,
{{AgentName}}
{{CompanyName}}',
    ARRAY['{{GuestName}}', '{{TourName}}', '{{Duration}}', '{{Nights}}', '{{StartDate}}', '{{EndDate}}', '{{NumTravelers}}', '{{TotalPrice}}', '{{TourHighlights}}', '{{AccommodationType}}', '{{ValidUntil}}', '{{DepositAmount}}', '{{AgentName}}', '{{CompanyName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- WhatsApp Quotation
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'WhatsApp Quick Quote',
    'Send brief quotation via WhatsApp',
    'customer',
    'quotation',
    'whatsapp',
    NULL,
    'Hi {{GuestName}}! Here''s your Egypt tour quote:

*{{TourName}}*
{{StartDate}} - {{EndDate}}
{{NumTravelers}} travelers

*Price: {{TotalPrice}}/person*

Includes:
- Hotels & Nile Cruise
- Private guide & transport
- All entrance fees
- Meals as per program

Valid until: {{ValidUntil}}

Deposit: {{DepositAmount}}

Let me know if you''d like to proceed or have questions!

- {{AgentName}}',
    ARRAY['{{GuestName}}', '{{TourName}}', '{{StartDate}}', '{{EndDate}}', '{{NumTravelers}}', '{{TotalPrice}}', '{{ValidUntil}}', '{{DepositAmount}}', '{{AgentName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Booking Confirmation
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Booking Confirmation',
    'Confirm booking after deposit received',
    'customer',
    'booking_confirmation',
    'email',
    'Booking Confirmed - {{TourName}} | {{BookingRef}}',
    'Dear {{GuestName}},

Great news! Your Egypt tour is now confirmed.

**Booking Reference: {{BookingRef}}**

**Tour Details:**
- Tour: {{TourName}}
- Dates: {{StartDate}} to {{EndDate}}
- Travelers: {{NumTravelers}}
- Total Price: {{TotalPrice}}

**Payment Status:**
- Deposit Received: {{DepositAmount}}
- Balance Due: {{BalanceDue}}
- Payment Deadline: {{PaymentDeadline}}

**Next Steps:**
1. Review your final itinerary (attached)
2. Ensure valid passport (6+ months validity)
3. Apply for Egypt visa if required
4. Purchase travel insurance
5. Pay remaining balance by {{PaymentDeadline}}

We will send you a detailed arrival guide 7 days before your trip.

If you have any questions, don''t hesitate to reach out!

Warm regards,
{{AgentName}}
{{CompanyName}}
{{AgentPhone}}',
    ARRAY['{{GuestName}}', '{{TourName}}', '{{BookingRef}}', '{{StartDate}}', '{{EndDate}}', '{{NumTravelers}}', '{{TotalPrice}}', '{{DepositAmount}}', '{{BalanceDue}}', '{{PaymentDeadline}}', '{{AgentName}}', '{{CompanyName}}', '{{AgentPhone}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Deposit Request
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Deposit Request',
    'Request deposit payment to confirm booking',
    'customer',
    'deposit_request',
    'both',
    'Secure Your Egypt Adventure - Deposit Required',
    'Dear {{GuestName}},

To confirm your booking for {{TourName}} ({{StartDate}} - {{EndDate}}), please submit your deposit of {{DepositAmount}}.

**Payment Options:**
1. Bank Transfer (details below)
2. Credit Card (secure link)
3. PayPal

**Bank Details:**
Bank: {{BankName}}
Account: {{AccountNumber}}
IBAN: {{IBAN}}
Reference: {{BookingRef}}

Once received, we will send your confirmation and start preparing your Egyptian adventure!

The deposit is fully refundable up to 30 days before departure.

Best regards,
{{AgentName}}',
    ARRAY['{{GuestName}}', '{{TourName}}', '{{StartDate}}', '{{EndDate}}', '{{DepositAmount}}', '{{BankName}}', '{{AccountNumber}}', '{{IBAN}}', '{{BookingRef}}', '{{AgentName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Day Before Reminder
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Day Before Arrival',
    'Send to clients the day before their trip starts',
    'customer',
    'day_before',
    'whatsapp',
    NULL,
    'Hi {{GuestName}}! Your Egypt adventure starts tomorrow!

*Arrival Details:*
Date: {{ArrivalDate}}
Flight: {{FlightNumber}}
Landing: {{ArrivalTime}}

Your guide {{GuideName}} will meet you at the airport holding a sign with your name.

*Guide Contact:*
{{GuideName}}: {{GuidePhone}}

*Emergency Contact:*
24/7 Support: {{EmergencyPhone}}

Safe travels! See you soon in Egypt!

- {{AgentName}}, {{CompanyName}}',
    ARRAY['{{GuestName}}', '{{ArrivalDate}}', '{{FlightNumber}}', '{{ArrivalTime}}', '{{GuideName}}', '{{GuidePhone}}', '{{EmergencyPhone}}', '{{AgentName}}', '{{CompanyName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Post-Trip Thank You
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Post-Trip Thank You',
    'Send after client returns from trip',
    'customer',
    'post_trip',
    'email',
    'Thank You for Traveling with {{CompanyName}}!',
    'Dear {{GuestName}},

Welcome home! We hope you had an amazing time in Egypt.

It was our pleasure to be part of your Egyptian adventure. Your photos and stories from the Pyramids, Luxor temples, and Nile cruise will surely be treasured memories!

**We''d Love Your Feedback**
Your opinion matters to us! Please take 2 minutes to share your experience:
{{ReviewLink}}

**Share Your Photos**
Tag us on Instagram @{{InstagramHandle}} - we''d love to see your Egypt moments!

**Refer a Friend**
Know someone planning to visit Egypt? Refer them to us and you both get {{ReferralDiscount}} off your next trip!

Thank you for choosing {{CompanyName}}. We hope to welcome you back to Egypt again!

Warm regards,
{{AgentName}} and the {{CompanyName}} Team',
    ARRAY['{{GuestName}}', '{{CompanyName}}', '{{ReviewLink}}', '{{InstagramHandle}}', '{{ReferralDiscount}}', '{{AgentName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- ============================================
  -- SUPPLIER TEMPLATES (Hotels, Cruises, Guides, Transport)
  -- ============================================

  -- Hotel Voucher
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Hotel Voucher',
    'Send hotel booking voucher to hotel',
    'supplier',
    'hotel_voucher',
    'email',
    'Booking Voucher - {{GuestName}} | {{CheckInDate}} | Ref: {{BookingRef}}',
    'Dear {{HotelName}} Reservations Team,

Please find below the booking voucher for our upcoming guest:

**BOOKING VOUCHER**

Guest Name: {{GuestName}}
Nationality: {{Nationality}}
Number of Guests: {{NumGuests}}

Check-in: {{CheckInDate}}
Check-out: {{CheckOutDate}}
Nights: {{NumNights}}

Room Type: {{RoomType}}
Meal Plan: {{MealPlan}}
Special Requests: {{SpecialRequests}}

Booking Reference: {{BookingRef}}
Arrival Time: {{ArrivalTime}}

Please confirm this reservation at your earliest convenience.

Best regards,
{{AgentName}}
{{CompanyName}}
{{AgentPhone}}',
    ARRAY['{{HotelName}}', '{{GuestName}}', '{{Nationality}}', '{{NumGuests}}', '{{CheckInDate}}', '{{CheckOutDate}}', '{{NumNights}}', '{{RoomType}}', '{{MealPlan}}', '{{SpecialRequests}}', '{{BookingRef}}', '{{ArrivalTime}}', '{{AgentName}}', '{{CompanyName}}', '{{AgentPhone}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Hotel Rate Request
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Hotel Rate Request',
    'Request rates and availability from hotel',
    'supplier',
    'rate_request',
    'email',
    'Rate Request - {{CheckInDate}} to {{CheckOutDate}}',
    'Dear {{HotelName}} Reservations,

We have a potential booking and would like to request your best available rates:

**Request Details:**
Check-in: {{CheckInDate}}
Check-out: {{CheckOutDate}}
Nights: {{NumNights}}

Rooms Required:
{{RoomRequirements}}

Meal Plan: {{MealPlan}}

Please provide:
1. Net rates for travel agents
2. Current availability
3. Cancellation policy
4. Any special offers

We look forward to your reply.

Best regards,
{{AgentName}}
{{CompanyName}}',
    ARRAY['{{HotelName}}', '{{CheckInDate}}', '{{CheckOutDate}}', '{{NumNights}}', '{{RoomRequirements}}', '{{MealPlan}}', '{{AgentName}}', '{{CompanyName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Nile Cruise Voucher
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Nile Cruise Voucher',
    'Send cruise booking voucher',
    'supplier',
    'cruise_voucher',
    'email',
    'Cruise Booking - {{GuestName}} | {{CruiseRoute}} | {{EmbarkDate}}',
    'Dear {{CruiseName}} Operations,

Please find the booking details for our upcoming guests:

**CRUISE VOUCHER**

Guest Name: {{GuestName}}
Nationality: {{Nationality}}
Number of Guests: {{NumGuests}}

Route: {{CruiseRoute}}
Embarkation: {{EmbarkDate}} at {{EmbarkTime}}
Disembarkation: {{DisembarkDate}}
Nights: {{NumNights}}

Cabin Type: {{CabinType}}
Cabin Numbers: {{CabinNumbers}}

Special Requests: {{SpecialRequests}}
Dietary Requirements: {{DietaryRequirements}}

Booking Reference: {{BookingRef}}

Please confirm cabin allocation.

Best regards,
{{AgentName}}
{{CompanyName}}',
    ARRAY['{{CruiseName}}', '{{GuestName}}', '{{Nationality}}', '{{NumGuests}}', '{{CruiseRoute}}', '{{EmbarkDate}}', '{{EmbarkTime}}', '{{DisembarkDate}}', '{{NumNights}}', '{{CabinType}}', '{{CabinNumbers}}', '{{SpecialRequests}}', '{{DietaryRequirements}}', '{{BookingRef}}', '{{AgentName}}', '{{CompanyName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Guide Assignment
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Guide Assignment',
    'Assign guide to tour group',
    'supplier',
    'guide_voucher',
    'whatsapp',
    NULL,
    'Hi {{GuideName}},

You have a new tour assignment:

*Tour:* {{TourName}}
*Guests:* {{GuestName}} ({{NumGuests}} pax)
*Language:* {{Language}}

*Dates:* {{StartDate}} - {{EndDate}}

*Day 1 - {{Day1Date}}:*
{{Day1Program}}

*Pickup:*
{{PickupLocation}}
Time: {{PickupTime}}

*Guest Contact:* {{GuestPhone}}

Please confirm your availability.

Thanks!
{{AgentName}}',
    ARRAY['{{GuideName}}', '{{TourName}}', '{{GuestName}}', '{{NumGuests}}', '{{Language}}', '{{StartDate}}', '{{EndDate}}', '{{Day1Date}}', '{{Day1Program}}', '{{PickupLocation}}', '{{PickupTime}}', '{{GuestPhone}}', '{{AgentName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Transport Booking
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Transport Booking',
    'Book vehicle and driver for tour',
    'supplier',
    'transport_voucher',
    'email',
    'Transport Request - {{TourName}} | {{StartDate}} to {{EndDate}}',
    'Dear {{TransportCompany}},

Please arrange the following transport service:

**TRANSPORT VOUCHER**

Client: {{GuestName}}
Group Size: {{NumGuests}} persons
Dates: {{StartDate}} - {{EndDate}}

**Vehicle Required:**
Type: {{VehicleType}}
Features: {{VehicleFeatures}}

**Itinerary:**
{{TransportItinerary}}

**Driver Requirements:**
- English speaking
- Licensed driver
- Mobile phone for communication

Booking Reference: {{BookingRef}}

Please confirm availability and driver details.

Best regards,
{{AgentName}}
{{CompanyName}}',
    ARRAY['{{TransportCompany}}', '{{GuestName}}', '{{NumGuests}}', '{{StartDate}}', '{{EndDate}}', '{{VehicleType}}', '{{VehicleFeatures}}', '{{TransportItinerary}}', '{{BookingRef}}', '{{AgentName}}', '{{CompanyName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- ============================================
  -- B2B PARTNER TEMPLATES (Tour Operators/Agencies)
  -- ============================================

  -- Rate Sheet
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'B2B Rate Sheet',
    'Send pricing to B2B partners',
    'partner',
    'rate_sheet',
    'email',
    '{{Season}} Rate Sheet - Egypt Tours | {{CompanyName}}',
    'Dear {{PartnerName}},

Please find attached our {{Season}} rate sheet for Egypt tours.

**Highlights:**
- Net rates for tour operators
- Validity: {{ValidFrom}} to {{ValidUntil}}
- Commission: {{CommissionRate}}%

**Tour Categories:**
1. Classic Egypt (7-10 days)
2. Nile Cruise packages (4-7 nights)
3. Day tours from Cairo
4. Custom FIT programs

**Pricing Basis:**
- Per person sharing (minimum 2 pax)
- Single supplement available
- Group rates for 10+ pax

**Included Services:**
- 4-5 star hotels
- Nile Cruise (5-star)
- Egyptologist guide
- All entrance fees
- Private A/C transport

Please let me know if you need customized packages for your clients.

Best regards,
{{AgentName}}
{{CompanyName}}
{{AgentEmail}}',
    ARRAY['{{PartnerName}}', '{{Season}}', '{{CompanyName}}', '{{ValidFrom}}', '{{ValidUntil}}', '{{CommissionRate}}', '{{AgentName}}', '{{AgentEmail}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Partner Quote
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'B2B Partner Quote',
    'Send tour quote to B2B partner',
    'partner',
    'partner_quote',
    'email',
    'Quote Request: {{TourName}} - {{NumPax}} Pax | Ref: {{QuoteRef}}',
    'Dear {{PartnerName}},

Thank you for your inquiry. Please find below our quotation:

**Quote Reference: {{QuoteRef}}**

**Tour:** {{TourName}}
**Dates:** {{StartDate}} - {{EndDate}}
**Duration:** {{Duration}} days / {{Nights}} nights

**Pricing Table (Net Rates):**
{{PricingTable}}

**Single Supplement:** {{SingleSupplement}}

**Included:**
{{IncludedServices}}

**Not Included:**
{{ExcludedServices}}

**Booking Conditions:**
- 30% deposit to confirm
- Full payment 30 days before arrival
- Cancellation policy as per contract

**Validity:** {{ValidUntil}}

Please advise if you wish to proceed or need any modifications.

Best regards,
{{AgentName}}
{{CompanyName}}',
    ARRAY['{{PartnerName}}', '{{TourName}}', '{{NumPax}}', '{{QuoteRef}}', '{{StartDate}}', '{{EndDate}}', '{{Duration}}', '{{Nights}}', '{{PricingTable}}', '{{SingleSupplement}}', '{{IncludedServices}}', '{{ExcludedServices}}', '{{ValidUntil}}', '{{AgentName}}', '{{CompanyName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Commission Statement
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Commission Statement',
    'Monthly commission statement for partners',
    'partner',
    'commission_statement',
    'email',
    'Commission Statement - {{Month}} {{Year}} | {{CompanyName}}',
    'Dear {{PartnerName}},

Please find below your commission statement for {{Month}} {{Year}}:

**Commission Summary:**
Total Bookings: {{TotalBookings}}
Total Revenue: {{TotalRevenue}}
Commission Rate: {{CommissionRate}}%
**Commission Earned: {{CommissionAmount}}**

**Booking Details:**
{{BookingDetails}}

**Payment:**
Payment will be processed by {{PaymentDate}}.
Bank: {{BankName}}
Reference: COMM-{{Month}}-{{Year}}

If you have any questions, please don''t hesitate to contact us.

Best regards,
{{AgentName}}
{{CompanyName}} Finance Team',
    ARRAY['{{PartnerName}}', '{{Month}}', '{{Year}}', '{{CompanyName}}', '{{TotalBookings}}', '{{TotalRevenue}}', '{{CommissionRate}}', '{{CommissionAmount}}', '{{BookingDetails}}', '{{PaymentDate}}', '{{BankName}}', '{{AgentName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Partnership Inquiry
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Partnership Welcome',
    'Welcome new B2B partner',
    'partner',
    'partnership',
    'email',
    'Welcome to {{CompanyName}} Partner Program!',
    'Dear {{PartnerName}},

Welcome to the {{CompanyName}} Partner Program! We are excited to work with you.

**Your Partner Details:**
Partner ID: {{PartnerId}}
Commission Rate: {{CommissionRate}}%
Payment Terms: {{PaymentTerms}}

**Getting Started:**
1. Review our rate sheets (attached)
2. Access our B2B portal: {{PortalLink}}
3. Contact our dedicated partner manager

**Your Partner Manager:**
{{PartnerManagerName}}
Email: {{PartnerManagerEmail}}
Phone: {{PartnerManagerPhone}}

**Resources:**
- Product manual & destination guide
- Marketing materials & images
- Sample itineraries

We look forward to a successful partnership!

Best regards,
{{AgentName}}
{{CompanyName}}',
    ARRAY['{{PartnerName}}', '{{CompanyName}}', '{{PartnerId}}', '{{CommissionRate}}', '{{PaymentTerms}}', '{{PortalLink}}', '{{PartnerManagerName}}', '{{PartnerManagerEmail}}', '{{PartnerManagerPhone}}', '{{AgentName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- ============================================
  -- INTERNAL TEMPLATES (Team Communication)
  -- ============================================

  -- Handover Notes
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Tour Handover',
    'Internal handover between team members',
    'internal',
    'handover',
    'email',
    'HANDOVER: {{TourName}} - {{GuestName}} | {{StartDate}}',
    'Hi {{TeamMemberName}},

Please take over the following tour:

**Tour Details:**
Client: {{GuestName}}
Tour: {{TourName}}
Dates: {{StartDate}} - {{EndDate}}
Pax: {{NumGuests}}

**Current Status:**
{{CurrentStatus}}

**Pending Actions:**
{{PendingActions}}

**Important Notes:**
{{ImportantNotes}}

**Contacts:**
Guide: {{GuideName}} - {{GuidePhone}}
Driver: {{DriverName}} - {{DriverPhone}}
Client: {{GuestPhone}}

**Documents:**
{{DocumentLinks}}

Let me know if you have any questions.

Thanks,
{{AgentName}}',
    ARRAY['{{TeamMemberName}}', '{{TourName}}', '{{GuestName}}', '{{StartDate}}', '{{EndDate}}', '{{NumGuests}}', '{{CurrentStatus}}', '{{PendingActions}}', '{{ImportantNotes}}', '{{GuideName}}', '{{GuidePhone}}', '{{DriverName}}', '{{DriverPhone}}', '{{GuestPhone}}', '{{DocumentLinks}}', '{{AgentName}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Incident Report
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Incident Report',
    'Report incidents during tours',
    'internal',
    'incident',
    'email',
    'INCIDENT REPORT: {{IncidentType}} - {{TourName}} | {{IncidentDate}}',
    '**INCIDENT REPORT**

**Tour Information:**
Tour: {{TourName}}
Client: {{GuestName}}
Date: {{IncidentDate}}
Location: {{IncidentLocation}}

**Incident Type:** {{IncidentType}}

**Description:**
{{IncidentDescription}}

**Persons Involved:**
{{PersonsInvolved}}

**Immediate Actions Taken:**
{{ActionsTaken}}

**Follow-up Required:**
{{FollowUpRequired}}

**Cost Impact:** {{CostImpact}}

**Attachments:**
{{Attachments}}

Reported by: {{AgentName}}
Date: {{ReportDate}}',
    ARRAY['{{IncidentType}}', '{{TourName}}', '{{IncidentDate}}', '{{GuestName}}', '{{IncidentLocation}}', '{{IncidentDescription}}', '{{PersonsInvolved}}', '{{ActionsTaken}}', '{{FollowUpRequired}}', '{{CostImpact}}', '{{Attachments}}', '{{AgentName}}', '{{ReportDate}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  -- Tour Debrief
  INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, language)
  VALUES (
    v_tenant_id,
    'Tour Debrief',
    'Post-tour debrief for internal review',
    'internal',
    'debrief',
    'email',
    'DEBRIEF: {{TourName}} - {{GuestName}} | {{EndDate}}',
    '**TOUR DEBRIEF**

**Tour:** {{TourName}}
**Client:** {{GuestName}}
**Dates:** {{StartDate}} - {{EndDate}}
**Pax:** {{NumGuests}}

**Overall Rating:** {{OverallRating}}/5

**What Went Well:**
{{WentWell}}

**Issues Encountered:**
{{Issues}}

**Supplier Feedback:**
- Hotels: {{HotelFeedback}}
- Cruise: {{CruiseFeedback}}
- Guide: {{GuideFeedback}}
- Transport: {{TransportFeedback}}

**Client Feedback:**
{{ClientFeedback}}

**Recommendations for Future Tours:**
{{Recommendations}}

**Financial Summary:**
Estimated Cost: {{EstimatedCost}}
Actual Cost: {{ActualCost}}
Variance: {{CostVariance}}

Prepared by: {{AgentName}}
Date: {{DebriefDate}}',
    ARRAY['{{TourName}}', '{{GuestName}}', '{{StartDate}}', '{{EndDate}}', '{{NumGuests}}', '{{OverallRating}}', '{{WentWell}}', '{{Issues}}', '{{HotelFeedback}}', '{{CruiseFeedback}}', '{{GuideFeedback}}', '{{TransportFeedback}}', '{{ClientFeedback}}', '{{Recommendations}}', '{{EstimatedCost}}', '{{ActualCost}}', '{{CostVariance}}', '{{AgentName}}', '{{DebriefDate}}'],
    'en'
  ) ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ Migration 024 completed: Seed message templates created';

END $$;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
  template_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO template_count FROM message_templates;
  RAISE NOTICE 'Total message templates in database: %', template_count;
END $$;
