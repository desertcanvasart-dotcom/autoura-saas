-- =====================================================================
-- Migration 213: Import B2B land-operator message templates (travel-ops-pro)
-- Description: Imports the sibling's DMC / land-operator B2B template suite
--              (category='b2b': quotes, amendments, confirmations, payments,
--              cancellations, relationship) into our existing message_templates
--              system. Complements migration 212 (customer/internal/supplier).
--              Same {{PascalCase}} placeholders; import-all, replace-dupes;
--              first tenant (mirrors 024/212). No schema changes.
-- Date: 2026-06-22
-- =====================================================================

DO $seedtpl$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenant found, skipping B2B template seeding';
    RETURN;
  END IF;

  -- Replace dupes: remove existing same-named templates for this tenant (22 names)
  DELETE FROM message_templates WHERE tenant_id = v_tenant_id AND name IN (
    'Quotation Acknowledgement',
    'Quotation Acknowledgement - WhatsApp',
    'Initial Quotation',
    'Clarification Request',
    'Clarification Request - WhatsApp',
    'Revised Quotation',
    'Amendment Cost Impact',
    'Amendment Cost Impact - WhatsApp',
    'Amendment Confirmation',
    'Alternative Proposal',
    'Provisional Booking Confirmation',
    'Final Booking Confirmation',
    'Service Summary',
    'Payment Request',
    'Payment Request - WhatsApp',
    'Payment Received Confirmation',
    'Balance Reminder',
    'Cancellation Acknowledgement',
    'Cancellation Charges',
    'Force Majeure Notice',
    'Post-Operation Follow-Up',
    'Product Update'
  );

  -- ===== B2B land-operator =====
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Quotation Acknowledgement',
  'Confirm receipt of quote request and set expectations',
  'b2b',
  'quotes',
  'email',
  'RE: {{RequestSubject}} - Quote Request Received',
  'Dear {{AgentName}},

Thank you for your inquiry. We have received your request for the following:

REQUEST SUMMARY:
• Destinations: {{Destinations}}
• Travel Dates: {{TravelDates}}
• Number of Travelers: {{Pax}}
• Nationality: {{Nationality}}

We are currently working on your quotation and will revert within {{ResponseTime}}.

Should you have any immediate questions, please don''t hesitate to reach out.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{AgentName}}', '{{RequestSubject}}', '{{Destinations}}', '{{TravelDates}}', '{{Pax}}', '{{Nationality}}', '{{ResponseTime}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- 1.1 Quotation Acknowledgement (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Quotation Acknowledgement - WhatsApp',
  'Quick acknowledgement of quote request',
  'b2b',
  'quotes',
  'whatsapp',
  'Dear {{AgentName}},

Thank you for your inquiry.

*Request received:*
• {{Destinations}}
• {{TravelDates}}
• {{Pax}} pax ({{Nationality}})

We''ll send your quotation within {{ResponseTime}}.

{{SenderName}}',
  ARRAY['{{AgentName}}', '{{Destinations}}', '{{TravelDates}}', '{{Pax}}', '{{Nationality}}', '{{ResponseTime}}', '{{SenderName}}']::text[],
  true
);

-- 1.2 Initial Quotation Submission (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Initial Quotation',
  'Submit official land quote with full scope and terms',
  'b2b',
  'quotes',
  'email',
  'Quotation {{QuoteRef}} - {{TourName}} - {{TravelDates}}',
  'Dear {{AgentName}},

Please find below our quotation as requested:

═══════════════════════════════════════
QUOTATION REFERENCE: {{QuoteRef}}
VERSION: {{QuoteVersion}}
VALIDITY: {{ValidUntil}}
═══════════════════════════════════════

TRIP DETAILS:
• Tour: {{TourName}}
• Dates: {{TravelDates}} ({{Duration}})
• Travelers: {{Pax}} ({{Nationality}})
• Service Level: {{ServiceLevel}}

PRICING (Net rates in {{Currency}}):
{{PricingBreakdown}}

TOTAL: {{TotalPrice}} {{Currency}}

───────────────────────────────────────
WHAT''S INCLUDED:
{{Inclusions}}

WHAT''S NOT INCLUDED:
{{Exclusions}}

───────────────────────────────────────
ASSUMPTIONS & CONDITIONS:
{{Assumptions}}

PAYMENT TERMS:
{{PaymentTerms}}

CANCELLATION POLICY:
{{CancellationPolicy}}

───────────────────────────────────────

This quotation is valid until {{ValidUntil}}. Prices are subject to availability at time of booking.

Please let us know if you need any clarifications or adjustments.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{AgentName}}', '{{QuoteRef}}', '{{QuoteVersion}}', '{{ValidUntil}}', '{{TourName}}', '{{TravelDates}}', '{{Duration}}', '{{Pax}}', '{{Nationality}}', '{{ServiceLevel}}', '{{Currency}}', '{{PricingBreakdown}}', '{{TotalPrice}}', '{{Inclusions}}', '{{Exclusions}}', '{{Assumptions}}', '{{PaymentTerms}}', '{{CancellationPolicy}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- 1.3 Clarification / Missing Information Request (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Clarification Request',
  'Request missing information to provide accurate quote',
  'b2b',
  'quotes',
  'email',
  'RE: {{RequestSubject}} - Information Required',
  'Dear {{AgentName}},

Thank you for your inquiry. To provide an accurate quotation, we kindly request the following information:

MISSING DETAILS:
{{MissingInfo}}

CLARIFICATIONS NEEDED:
{{Clarifications}}

Once we receive this information, we will finalize your quotation within {{ResponseTime}}.

Thank you for your cooperation.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{AgentName}}', '{{RequestSubject}}', '{{MissingInfo}}', '{{Clarifications}}', '{{ResponseTime}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- 1.3 Clarification Request (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Clarification Request - WhatsApp',
  'Quick clarification request via WhatsApp',
  'b2b',
  'quotes',
  'whatsapp',
  'Dear {{AgentName}},

To finalize your quote, we need:

{{MissingInfo}}

Please advise.

{{SenderName}}',
  ARRAY['{{AgentName}}', '{{MissingInfo}}', '{{SenderName}}']::text[],
  true
);

-- 1.4 Revised Quotation (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Revised Quotation',
  'Updated quotation after changes or amendments',
  'b2b',
  'quotes',
  'email',
  'REVISED: Quotation {{QuoteRef}} v{{QuoteVersion}} - {{TourName}}',
  'Dear {{AgentName}},

Please find below our revised quotation based on {{RevisionReason}}.

═══════════════════════════════════════
QUOTATION REFERENCE: {{QuoteRef}}
VERSION: {{QuoteVersion}} (Previous: v{{PreviousVersion}})
VALIDITY: {{ValidUntil}}
═══════════════════════════════════════

CHANGES FROM PREVIOUS VERSION:
{{ChangesSummary}}

───────────────────────────────────────

UPDATED TRIP DETAILS:
• Tour: {{TourName}}
• Dates: {{TravelDates}} ({{Duration}})
• Travelers: {{Pax}} ({{Nationality}})
• Service Level: {{ServiceLevel}}

REVISED PRICING ({{Currency}}):
{{PricingBreakdown}}

NEW TOTAL: {{TotalPrice}} {{Currency}}
(Previous: {{PreviousTotal}} {{Currency}})

───────────────────────────────────────
INCLUSIONS:
{{Inclusions}}

EXCLUSIONS:
{{Exclusions}}

───────────────────────────────────────

This quotation supersedes all previous versions. Valid until {{ValidUntil}}.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{AgentName}}', '{{QuoteRef}}', '{{QuoteVersion}}', '{{PreviousVersion}}', '{{ValidUntil}}', '{{RevisionReason}}', '{{ChangesSummary}}', '{{TourName}}', '{{TravelDates}}', '{{Duration}}', '{{Pax}}', '{{Nationality}}', '{{ServiceLevel}}', '{{Currency}}', '{{PricingBreakdown}}', '{{TotalPrice}}', '{{PreviousTotal}}', '{{Inclusions}}', '{{Exclusions}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- =====================================================
-- 2. AMENDMENTS & ADJUSTMENTS
-- =====================================================

-- 2.1 Amendment Cost Impact Notification (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Amendment Cost Impact',
  'Explain how a requested change affects pricing',
  'b2b',
  'amendments',
  'email',
  'Amendment Impact - Ref {{BookingRef}} - {{GuestName}}',
  'Dear {{AgentName}},

Regarding your requested amendment for booking {{BookingRef}}:

REQUESTED CHANGE:
{{AmendmentRequest}}

IMPACT ASSESSMENT:
───────────────────────────────────────
Original Cost: {{OriginalCost}} {{Currency}}
Amendment Cost: {{AmendmentCost}} {{Currency}}
───────────────────────────────────────
Difference: {{CostDifference}} {{Currency}}
───────────────────────────────────────

BREAKDOWN OF CHANGES:
{{CostBreakdown}}

REASON FOR ADJUSTMENT:
{{AdjustmentReason}}

Please confirm if you wish to proceed with this amendment. Upon your approval, we will update the booking accordingly.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{AmendmentRequest}}', '{{OriginalCost}}', '{{AmendmentCost}}', '{{CostDifference}}', '{{Currency}}', '{{CostBreakdown}}', '{{AdjustmentReason}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- 2.1 Amendment Cost Impact (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Amendment Cost Impact - WhatsApp',
  'Quick amendment cost notification',
  'b2b',
  'amendments',
  'whatsapp',
  'Dear {{AgentName}},

*Amendment Impact - {{BookingRef}}*

Requested: {{AmendmentRequest}}

*Cost Change:*
Original: {{OriginalCost}} {{Currency}}
New: {{AmendmentCost}} {{Currency}}
*Difference: {{CostDifference}} {{Currency}}*

Please confirm to proceed.

{{SenderName}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{AmendmentRequest}}', '{{OriginalCost}}', '{{AmendmentCost}}', '{{CostDifference}}', '{{Currency}}', '{{SenderName}}']::text[],
  true
);

-- 2.2 Amendment Confirmation (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Amendment Confirmation',
  'Confirm amendment has been processed',
  'b2b',
  'amendments',
  'email',
  'CONFIRMED: Amendment - Ref {{BookingRef}}',
  'Dear {{AgentName}},

This confirms that the following amendment has been processed for booking {{BookingRef}}:

AMENDMENT DETAILS:
───────────────────────────────────────
Guest Name: {{GuestName}}
Amendment Date: {{AmendmentDate}}
───────────────────────────────────────

CHANGES APPLIED:
{{AmendmentDetails}}

UPDATED BOOKING SUMMARY:
{{UpdatedBookingSummary}}

REVISED COST: {{RevisedCost}} {{Currency}}

Please review and confirm this information is correct.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{AmendmentDate}}', '{{AmendmentDetails}}', '{{UpdatedBookingSummary}}', '{{RevisedCost}}', '{{Currency}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- 2.3 Alternative Proposal (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Alternative Proposal',
  'Offer alternatives when original request not feasible',
  'b2b',
  'amendments',
  'email',
  'Alternative Options - {{RequestSubject}}',
  'Dear {{AgentName}},

Regarding your request for {{OriginalRequest}}:

SITUATION:
{{UnavailabilityReason}}

ALTERNATIVE OPTIONS:
───────────────────────────────────────

OPTION A: {{OptionAName}}
{{OptionADetails}}
Cost: {{OptionACost}} {{Currency}}

───────────────────────────────────────

OPTION B: {{OptionBName}}
{{OptionBDetails}}
Cost: {{OptionBCost}} {{Currency}}

───────────────────────────────────────

OUR RECOMMENDATION:
{{Recommendation}}

Please advise your preference, and we will proceed accordingly.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{AgentName}}', '{{RequestSubject}}', '{{OriginalRequest}}', '{{UnavailabilityReason}}', '{{OptionAName}}', '{{OptionADetails}}', '{{OptionACost}}', '{{OptionBName}}', '{{OptionBDetails}}', '{{OptionBCost}}', '{{Currency}}', '{{Recommendation}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- =====================================================
-- 3. BOOKING & OPERATIONS
-- =====================================================

-- 3.1 Provisional Booking Confirmation (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Provisional Booking Confirmation',
  'Confirm services are on hold with deadline',
  'b2b',
  'confirmations',
  'email',
  'PROVISIONAL: Booking {{BookingRef}} - {{GuestName}} - ON HOLD',
  'Dear {{AgentName}},

We are pleased to confirm that the following services are now ON HOLD:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
STATUS: PROVISIONAL
HOLD EXPIRES: {{HoldExpiry}}
═══════════════════════════════════════

GUEST DETAILS:
• Name: {{GuestName}}
• Nationality: {{Nationality}}
• Number of Travelers: {{Pax}}

SERVICES ON HOLD:
{{ServicesOnHold}}

DATES: {{TravelDates}}

───────────────────────────────────────
IMPORTANT:
• This booking will be released automatically after {{HoldExpiry}} if not confirmed
• To confirm, please send written confirmation and deposit payment
• Deposit Required: {{DepositAmount}} {{Currency}}
• Deposit Deadline: {{DepositDeadline}}
───────────────────────────────────────

Please confirm at your earliest convenience to secure these services.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{Nationality}}', '{{Pax}}', '{{ServicesOnHold}}', '{{TravelDates}}', '{{HoldExpiry}}', '{{DepositAmount}}', '{{DepositDeadline}}', '{{Currency}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- 3.2 Final Booking Confirmation (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Final Booking Confirmation',
  'Confirm all services are locked and confirmed',
  'b2b',
  'confirmations',
  'email',
  'CONFIRMED: Booking {{BookingRef}} - {{GuestName}} - {{TravelDates}}',
  'Dear {{AgentName}},

We are pleased to confirm that all services for the below booking are now CONFIRMED:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
STATUS: CONFIRMED
CONFIRMATION DATE: {{ConfirmationDate}}
═══════════════════════════════════════

GUEST DETAILS:
• Full Name: {{GuestName}}
• Nationality: {{Nationality}}
• Passport Number: {{PassportNumber}}
• Number of Travelers: {{Pax}}

TRAVEL DATES: {{TravelDates}}

───────────────────────────────────────
CONFIRMED SERVICES:
───────────────────────────────────────
{{ConfirmedServices}}

───────────────────────────────────────
ACCOMMODATION:
───────────────────────────────────────
{{AccommodationDetails}}

───────────────────────────────────────
FINANCIAL SUMMARY:
Total Cost: {{TotalCost}} {{Currency}}
Deposit Received: {{DepositReceived}} {{Currency}}
Balance Due: {{BalanceDue}} {{Currency}}
Balance Due Date: {{BalanceDueDate}}
───────────────────────────────────────

EMERGENCY CONTACT:
{{EmergencyContact}}

Vouchers will be issued upon receipt of final payment.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{Nationality}}', '{{PassportNumber}}', '{{Pax}}', '{{TravelDates}}', '{{ConfirmationDate}}', '{{ConfirmedServices}}', '{{AccommodationDetails}}', '{{TotalCost}}', '{{DepositReceived}}', '{{BalanceDue}}', '{{BalanceDueDate}}', '{{Currency}}', '{{EmergencyContact}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- 3.3 Service Summary / Ground Handling Confirmation (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Service Summary',
  'Clean overview of all confirmed services',
  'b2b',
  'confirmations',
  'email',
  'Service Summary - {{BookingRef}} - {{GuestName}}',
  'Dear {{AgentName}},

Please find below the complete service summary for your reference:

═══════════════════════════════════════
BOOKING: {{BookingRef}}
GUEST: {{GuestName}} ({{Pax}} pax)
DATES: {{TravelDates}}
═══════════════════════════════════════

DAY-BY-DAY SERVICES:
───────────────────────────────────────
{{DayByDayServices}}
───────────────────────────────────────

ACCOMMODATION SUMMARY:
{{AccommodationSummary}}

TRANSPORT SUMMARY:
{{TransportSummary}}

GUIDE SERVICES:
{{GuideServices}}

INCLUDED MEALS:
{{MealsSummary}}

───────────────────────────────────────
SUPPLIER CONTACTS (FOR EMERGENCIES):
{{SupplierContacts}}
───────────────────────────────────────

Please review and confirm all details are correct.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{Pax}}', '{{TravelDates}}', '{{DayByDayServices}}', '{{AccommodationSummary}}', '{{TransportSummary}}', '{{GuideServices}}', '{{MealsSummary}}', '{{SupplierContacts}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- =====================================================
-- 4. FINANCIAL COMMUNICATION
-- =====================================================

-- 4.1 Payment Request / Deposit Request (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Payment Request',
  'Request deposit or payment professionally',
  'b2b',
  'payments',
  'email',
  'Payment Request - Booking {{BookingRef}} - {{PaymentType}}',
  'Dear {{AgentName}},

Kindly arrange payment for the following booking:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
TRAVEL DATES: {{TravelDates}}
═══════════════════════════════════════

PAYMENT DETAILS:
───────────────────────────────────────
Payment Type: {{PaymentType}}
Amount Due: {{AmountDue}} {{Currency}}
Due Date: {{DueDate}}
───────────────────────────────────────

BANK DETAILS:
{{BankDetails}}

IMPORTANT:
• Please include booking reference {{BookingRef}} in the transfer description
• Services will be confirmed/vouchers issued upon receipt of payment
• Late payment may result in release of bookings

Please send payment confirmation once transferred.

Best regards,
{{SenderName}}
{{CompanyName}}
Accounts Department',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{TravelDates}}', '{{PaymentType}}', '{{AmountDue}}', '{{DueDate}}', '{{Currency}}', '{{BankDetails}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- 4.1 Payment Request (WhatsApp)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Payment Request - WhatsApp',
  'Quick payment request',
  'b2b',
  'payments',
  'whatsapp',
  'Dear {{AgentName}},

*Payment Request*

Booking: {{BookingRef}}
Guest: {{GuestName}}
Amount: *{{AmountDue}} {{Currency}}*
Due: {{DueDate}}

Please arrange payment and send confirmation.

{{SenderName}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{AmountDue}}', '{{Currency}}', '{{DueDate}}', '{{SenderName}}']::text[],
  true
);

-- 4.2 Payment Received Confirmation (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Payment Received Confirmation',
  'Confirm receipt of payment',
  'b2b',
  'payments',
  'email',
  'Payment Received - Booking {{BookingRef}} - Thank You',
  'Dear {{AgentName}},

We confirm receipt of your payment:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
═══════════════════════════════════════

PAYMENT RECEIVED:
───────────────────────────────────────
Amount: {{AmountReceived}} {{Currency}}
Date Received: {{PaymentDate}}
Payment Method: {{PaymentMethod}}
Transaction Reference: {{TransactionRef}}
───────────────────────────────────────

ACCOUNT STATUS:
Total Cost: {{TotalCost}} {{Currency}}
Total Paid: {{TotalPaid}} {{Currency}}
Balance: {{Balance}} {{Currency}}

{{NextSteps}}

Thank you for your payment.

Best regards,
{{SenderName}}
{{CompanyName}}
Accounts Department',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{AmountReceived}}', '{{PaymentDate}}', '{{PaymentMethod}}', '{{TransactionRef}}', '{{TotalCost}}', '{{TotalPaid}}', '{{Balance}}', '{{Currency}}', '{{NextSteps}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- 4.3 Balance Reminder (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Balance Reminder',
  'Polite reminder for outstanding balance',
  'b2b',
  'payments',
  'email',
  'Reminder: Balance Due - Booking {{BookingRef}}',
  'Dear {{AgentName}},

This is a friendly reminder regarding the outstanding balance for the following booking:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
TRAVEL DATES: {{TravelDates}}
═══════════════════════════════════════

PAYMENT STATUS:
───────────────────────────────────────
Total Cost: {{TotalCost}} {{Currency}}
Amount Paid: {{AmountPaid}} {{Currency}}
Outstanding Balance: {{BalanceDue}} {{Currency}}
Original Due Date: {{OriginalDueDate}}
───────────────────────────────────────

Please arrange payment at your earliest convenience to avoid any impact on confirmed services.

If payment has already been made, kindly disregard this reminder and send us the transfer confirmation.

Best regards,
{{SenderName}}
{{CompanyName}}
Accounts Department',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{TravelDates}}', '{{TotalCost}}', '{{AmountPaid}}', '{{BalanceDue}}', '{{OriginalDueDate}}', '{{Currency}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- =====================================================
-- 5. CANCELLATIONS, RISKS & PROTECTION
-- =====================================================

-- 5.1 Cancellation Acknowledgement (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Cancellation Acknowledgement',
  'Acknowledge receipt of cancellation request',
  'b2b',
  'cancellations',
  'email',
  'Cancellation Received - Booking {{BookingRef}}',
  'Dear {{AgentName}},

We acknowledge receipt of your cancellation request for the following booking:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
TRAVEL DATES: {{TravelDates}}
CANCELLATION RECEIVED: {{CancellationDate}}
═══════════════════════════════════════

We are currently processing your request and calculating any applicable charges based on our terms and conditions.

We will send you a detailed cancellation statement within {{ResponseTime}}.

If you have any questions, please don''t hesitate to contact us.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{TravelDates}}', '{{CancellationDate}}', '{{ResponseTime}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- 5.2 Cancellation Charges Notification (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Cancellation Charges',
  'Clearly state cancellation penalties',
  'b2b',
  'cancellations',
  'email',
  'Cancellation Charges - Booking {{BookingRef}}',
  'Dear {{AgentName}},

Following your cancellation request for booking {{BookingRef}}, please find below the cancellation charges:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
ORIGINAL TRAVEL DATES: {{TravelDates}}
CANCELLATION DATE: {{CancellationDate}}
═══════════════════════════════════════

CANCELLATION BREAKDOWN:
───────────────────────────────────────
{{CancellationBreakdown}}
───────────────────────────────────────

SUMMARY:
Total Booking Value: {{TotalBookingValue}} {{Currency}}
Cancellation Charges: {{CancellationCharges}} {{Currency}}
Refund Due: {{RefundDue}} {{Currency}}

───────────────────────────────────────
POLICY REFERENCE:
{{PolicyReference}}
───────────────────────────────────────

{{RefundInstructions}}

Please confirm your acceptance of these charges.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{TravelDates}}', '{{CancellationDate}}', '{{CancellationBreakdown}}', '{{TotalBookingValue}}', '{{CancellationCharges}}', '{{RefundDue}}', '{{Currency}}', '{{PolicyReference}}', '{{RefundInstructions}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- 5.3 Force Majeure / Operational Constraint Notice (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Force Majeure Notice',
  'Notify about operational constraints beyond control',
  'b2b',
  'cancellations',
  'email',
  'IMPORTANT: Operational Notice - {{AffectedArea}} - {{IssueType}}',
  'Dear {{AgentName}},

We wish to inform you of a situation that may affect bookings in {{AffectedArea}}:

═══════════════════════════════════════
NOTICE TYPE: {{IssueType}}
AFFECTED AREA: {{AffectedArea}}
EFFECTIVE: {{EffectiveDate}}
STATUS: {{CurrentStatus}}
═══════════════════════════════════════

SITUATION:
{{SituationDescription}}

IMPACT ON SERVICES:
{{ServiceImpact}}

───────────────────────────────────────
AFFECTED BOOKINGS:
{{AffectedBookings}}
───────────────────────────────────────

RECOMMENDED ACTIONS:
{{RecommendedActions}}

ALTERNATIVE OPTIONS:
{{AlternativeOptions}}

───────────────────────────────────────

We will continue to monitor the situation and provide updates as available.

For any urgent matters, please contact us directly.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{AgentName}}', '{{IssueType}}', '{{AffectedArea}}', '{{EffectiveDate}}', '{{CurrentStatus}}', '{{SituationDescription}}', '{{ServiceImpact}}', '{{AffectedBookings}}', '{{RecommendedActions}}', '{{AlternativeOptions}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- =====================================================
-- 6. RELATIONSHIP & PROFESSIONALISM
-- =====================================================

-- 6.1 Post-Operation Follow-Up (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Post-Operation Follow-Up',
  'Follow up after trip completion',
  'b2b',
  'relationship',
  'email',
  'Follow-Up: Booking {{BookingRef}} - {{GuestName}}',
  'Dear {{AgentName}},

We hope {{GuestName}}''s trip was enjoyable and met expectations.

TRIP SUMMARY:
• Booking Reference: {{BookingRef}}
• Travel Dates: {{TravelDates}}
• Services Provided: {{ServicesProvided}}

We would appreciate any feedback from your clients to help us maintain our service standards.

Should there be any outstanding matters or concerns, please don''t hesitate to let us know.

We look forward to our continued partnership.

Best regards,
{{SenderName}}
{{CompanyName}}',
  ARRAY['{{AgentName}}', '{{BookingRef}}', '{{GuestName}}', '{{TravelDates}}', '{{ServicesProvided}}', '{{SenderName}}', '{{CompanyName}}']::text[],
  true
);

-- 6.2 Seasonal Rates / Product Update (Email)
INSERT INTO message_templates (tenant_id, name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (v_tenant_id, 
  'Product Update',
  'Share seasonal rates or product updates',
  'b2b',
  'relationship',
  'email',
  '{{UpdateType}} - {{Season}} {{Year}}',
  'Dear {{AgentName}},

We would like to share the following update:

═══════════════════════════════════════
{{UpdateType}}
EFFECTIVE: {{EffectivePeriod}}
═══════════════════════════════════════

{{UpdateDetails}}

KEY HIGHLIGHTS:
{{KeyHighlights}}

───────────────────────────────────────

For detailed information or specific quotes, please contact us.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  ARRAY['{{AgentName}}', '{{UpdateType}}', '{{Season}}', '{{Year}}', '{{EffectivePeriod}}', '{{UpdateDetails}}', '{{KeyHighlights}}', '{{SenderName}}', '{{CompanyName}}', '{{SenderPhone}}']::text[],
  true
);

-- =====================================================
-- ADD B2B PLACEHOLDERS
-- =====================================================


  -- ===== B2B placeholder registry =====
  INSERT INTO template_placeholders (tenant_id, placeholder, display_name, category, example_value)
VALUES
  (v_tenant_id, '{{AgentName}}', 'Agent Name', 'b2b', 'John Smith'),
  (v_tenant_id, '{{QuoteRef}}', 'Quote Reference', 'b2b', 'QT-2026-0042'),
  (v_tenant_id, '{{QuoteVersion}}', 'Quote Version', 'b2b', '2'),
  (v_tenant_id, '{{PreviousVersion}}', 'Previous Version', 'b2b', '1'),
  (v_tenant_id, '{{ValidUntil}}', 'Valid Until', 'b2b', '15 March 2026'),
  (v_tenant_id, '{{ResponseTime}}', 'Response Time', 'b2b', '24-48 hours'),
  (v_tenant_id, '{{TourName}}', 'Tour Name', 'b2b', 'Classic Egypt 8 Days'),
  (v_tenant_id, '{{TravelDates}}', 'Travel Dates', 'b2b', '10-17 March 2026'),
  (v_tenant_id, '{{Duration}}', 'Duration', 'b2b', '8 days / 7 nights'),
  (v_tenant_id, '{{Pax}}', 'Pax', 'b2b', '4 adults, 2 children'),
  (v_tenant_id, '{{ServiceLevel}}', 'Service Level', 'b2b', 'Deluxe'),
  (v_tenant_id, '{{PricingBreakdown}}', 'Pricing Breakdown', 'b2b', 'Accommodation: $1,200...'),
  (v_tenant_id, '{{TotalPrice}}', 'Total Price', 'b2b', '3,500.00'),
  (v_tenant_id, '{{Inclusions}}', 'Inclusions', 'b2b', '• Airport transfers...'),
  (v_tenant_id, '{{Exclusions}}', 'Exclusions', 'b2b', '• International flights...'),
  (v_tenant_id, '{{Assumptions}}', 'Assumptions', 'b2b', '• Based on 4-star hotels...'),
  (v_tenant_id, '{{PaymentTerms}}', 'Payment Terms', 'b2b', '30% deposit, balance 30 days prior'),
  (v_tenant_id, '{{CancellationPolicy}}', 'Cancellation Policy', 'b2b', '30+ days: 10% penalty...'),
  (v_tenant_id, '{{RevisionReason}}', 'Revision Reason', 'b2b', 'hotel category upgrade'),
  (v_tenant_id, '{{ChangesSummary}}', 'Changes Summary', 'b2b', '• Upgraded from 4* to 5* hotels'),
  (v_tenant_id, '{{PreviousTotal}}', 'Previous Total', 'b2b', '3,200.00'),
  (v_tenant_id, '{{MissingInfo}}', 'Missing Info', 'b2b', '• Exact nationality...'),
  (v_tenant_id, '{{Clarifications}}', 'Clarifications', 'b2b', '• Private or shared tours?'),
  (v_tenant_id, '{{HoldExpiry}}', 'Hold Expiry', 'b2b', '5 March 2026, 18:00'),
  (v_tenant_id, '{{DepositAmount}}', 'Deposit Amount', 'b2b', '1,000.00'),
  (v_tenant_id, '{{DepositDeadline}}', 'Deposit Deadline', 'b2b', '3 March 2026'),
  (v_tenant_id, '{{ServicesOnHold}}', 'Services on Hold', 'b2b', '• Marriott Mena House...'),
  (v_tenant_id, '{{ConfirmedServices}}', 'Confirmed Services', 'b2b', 'Day 1: Airport transfer...'),
  (v_tenant_id, '{{AccommodationDetails}}', 'Accommodation Details', 'b2b', 'Night 1-2: Marriott...'),
  (v_tenant_id, '{{BalanceDue}}', 'Balance Due', 'b2b', '2,500.00'),
  (v_tenant_id, '{{BalanceDueDate}}', 'Balance Due Date', 'b2b', '1 March 2026'),
  (v_tenant_id, '{{EmergencyContact}}', 'Emergency Contact', 'b2b', '+20 123 456 7890 (24/7)'),
  (v_tenant_id, '{{DayByDayServices}}', 'Day-by-Day Services', 'b2b', 'Day 1: Arrival...'),
  (v_tenant_id, '{{AccommodationSummary}}', 'Accommodation Summary', 'b2b', '2 nights Cairo, 3 nights cruise...'),
  (v_tenant_id, '{{TransportSummary}}', 'Transport Summary', 'b2b', 'Private A/C vehicle throughout'),
  (v_tenant_id, '{{GuideServices}}', 'Guide Services', 'b2b', 'English-speaking guide: Days 1-8'),
  (v_tenant_id, '{{MealsSummary}}', 'Meals Summary', 'b2b', '7 breakfasts, 4 lunches, 3 dinners'),
  (v_tenant_id, '{{SupplierContacts}}', 'Supplier Contacts', 'b2b', 'Hotel: +20 xxx, Guide: +20 xxx'),
  (v_tenant_id, '{{PaymentType}}', 'Payment Type', 'b2b', 'Deposit'),
  (v_tenant_id, '{{AmountDue}}', 'Amount Due', 'b2b', '1,000.00'),
  (v_tenant_id, '{{DueDate}}', 'Due Date', 'b2b', '5 March 2026'),
  (v_tenant_id, '{{BankDetails}}', 'Bank Details', 'b2b', 'Bank: XYZ Bank...'),
  (v_tenant_id, '{{AmountReceived}}', 'Amount Received', 'b2b', '1,000.00'),
  (v_tenant_id, '{{PaymentDate}}', 'Payment Date', 'b2b', '3 March 2026'),
  (v_tenant_id, '{{PaymentMethod}}', 'Payment Method', 'b2b', 'Bank Transfer'),
  (v_tenant_id, '{{TransactionRef}}', 'Transaction Ref', 'b2b', 'TRX-20260303-001'),
  (v_tenant_id, '{{TotalCost}}', 'Total Cost', 'b2b', '3,500.00'),
  (v_tenant_id, '{{TotalPaid}}', 'Total Paid', 'b2b', '1,000.00'),
  (v_tenant_id, '{{Balance}}', 'Balance', 'b2b', '2,500.00'),
  (v_tenant_id, '{{NextSteps}}', 'Next Steps', 'b2b', 'Balance due by 1 March. Vouchers will be issued upon final payment.'),
  (v_tenant_id, '{{AmountPaid}}', 'Amount Paid', 'b2b', '1,000.00'),
  (v_tenant_id, '{{OriginalDueDate}}', 'Original Due Date', 'b2b', '25 February 2026'),
  (v_tenant_id, '{{CancellationBreakdown}}', 'Cancellation Breakdown', 'b2b', 'Hotel: $200, Cruise: $500...'),
  (v_tenant_id, '{{TotalBookingValue}}', 'Total Booking Value', 'b2b', '3,500.00'),
  (v_tenant_id, '{{CancellationCharges}}', 'Cancellation Charges', 'b2b', '700.00'),
  (v_tenant_id, '{{RefundDue}}', 'Refund Due', 'b2b', '300.00'),
  (v_tenant_id, '{{PolicyReference}}', 'Policy Reference', 'b2b', 'As per our T&Cs section 5.2...'),
  (v_tenant_id, '{{RefundInstructions}}', 'Refund Instructions', 'b2b', 'Refund will be processed within 14 working days.'),
  (v_tenant_id, '{{IssueType}}', 'Issue Type', 'b2b', 'Force Majeure'),
  (v_tenant_id, '{{AffectedArea}}', 'Affected Area', 'b2b', 'South Sinai'),
  (v_tenant_id, '{{EffectiveDate}}', 'Effective Date', 'b2b', '1 March 2026'),
  (v_tenant_id, '{{CurrentStatus}}', 'Current Status', 'b2b', 'Under Review'),
  (v_tenant_id, '{{SituationDescription}}', 'Situation Description', 'b2b', 'Due to weather conditions...'),
  (v_tenant_id, '{{ServiceImpact}}', 'Service Impact', 'b2b', 'Abu Simbel flights suspended'),
  (v_tenant_id, '{{AffectedBookings}}', 'Affected Bookings', 'b2b', 'BKG-001, BKG-002, BKG-003'),
  (v_tenant_id, '{{RecommendedActions}}', 'Recommended Actions', 'b2b', 'Consider alternative dates...'),
  (v_tenant_id, '{{AlternativeOptions}}', 'Alternative Options', 'b2b', 'Option A: Reschedule to...'),
  (v_tenant_id, '{{ServicesProvided}}', 'Services Provided', 'b2b', 'Cairo tour, Nile cruise, Luxor tour'),
  (v_tenant_id, '{{UpdateType}}', 'Update Type', 'b2b', 'New Season Rates'),
  (v_tenant_id, '{{Season}}', 'Season', 'b2b', 'Winter'),
  (v_tenant_id, '{{Year}}', 'Year', 'b2b', '2026'),
  (v_tenant_id, '{{EffectivePeriod}}', 'Effective Period', 'b2b', 'November 2026 - March 2027'),
  (v_tenant_id, '{{UpdateDetails}}', 'Update Details', 'b2b', 'New contracted rates with hotels...'),
  (v_tenant_id, '{{KeyHighlights}}', 'Key Highlights', 'b2b', '• 15% reduction on 5* hotels...')
ON CONFLICT (tenant_id, placeholder) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  example_value = EXCLUDED.example_value;

  RAISE NOTICE 'Migration 213: imported % B2B message templates for tenant %', 22, v_tenant_id;
END $seedtpl$;
