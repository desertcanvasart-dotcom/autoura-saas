-- ============================================================================
-- 254 — stripe_webhook_events: durable replay protection
-- ============================================================================
--
-- The billing webhook processed every delivery unconditionally: `event.id`
-- appeared nowhere in the handler. That was survivable only because an API
-- version drift meant no handler ever completed. With the drift fixed
-- (lib/stripe-webhook-fields.ts) the handlers DO run, and money moves — so
-- replay protection has to exist before that ships, not after.
--
-- Stripe retries a failed delivery for up to ~3 days. The Stripe idempotency
-- key on the onboarding fee only covers 24 hours, so the gap between those two
-- windows is exactly where a duplicate $500-$1,500 charge lives. This table
-- closes it durably: an event id is claimed ONCE, forever.
--
-- The claim is the INSERT itself. A unique primary key makes the race
-- unwinnable — the second concurrent delivery gets 23505 and stops — which is
-- the same "let the database arbitrate" pattern used for one-active-share in
-- migration 253, rather than a read-then-write the application has to get right.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  -- Stripe's own event id (evt_...). PK: claiming is inserting.
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Set when the handler finishes. A row with NULL means "claimed but did not
  -- complete" — the signal to look at, since Stripe stops retrying an event we
  -- already answered 200.
  processed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_unprocessed
  ON stripe_webhook_events (received_at DESC)
  WHERE processed_at IS NULL;

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role only. This is platform billing infrastructure: no tenant owns a
-- row here, and nothing in the app should read it. No authenticated policy, no
-- anon policy — verify:rls guards it.
DROP POLICY IF EXISTS stripe_webhook_events_service_role ON stripe_webhook_events;
CREATE POLICY stripe_webhook_events_service_role ON stripe_webhook_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE stripe_webhook_events IS
  'Replay guard for Stripe webhook deliveries. The PK insert IS the claim: a '
  'duplicate delivery fails with 23505 and is skipped. Rows with processed_at '
  'NULL are claimed-but-incomplete and worth investigating.';

-- ============================================================================
-- Verify after applying:
--   npm run verify:rls
--   Stripe CLI: `stripe trigger customer.subscription.updated` twice with the
--   same event id — the second must log "duplicate delivery, skipping".
-- ============================================================================
