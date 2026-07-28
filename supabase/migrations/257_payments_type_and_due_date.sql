-- ============================================================================
-- 257 — payments: the columns the UI has always sent
-- ============================================================================
--
-- Recording a payment has never worked. Three UIs (/payments/new,
-- /payments/record, /payments/[id]/edit) POST `payment_type`,
-- `payment_status` and `due_date` to /api/payments, which does
-- `insert({ tenant_id, ...body })`. None of those columns exist on `payments`,
-- so PostgREST answers:
--
--   400 PGRST204 — Could not find the 'payment_type' column of 'payments'
--
-- Verified against production before writing this: the insert fails, and
-- `payments` holds 0 rows — no payment has ever been recorded on any tenant.
-- Nothing to backfill, nothing to migrate.
--
-- Of the three, only two are real:
--
--   payment_type  — genuine. An operator recording a 30% deposit needs that
--                   distinguished from a balance payment. Vocabulary matches
--                   booking_payments (migration 100) deliberately, so the two
--                   payment concepts describe themselves the same way.
--
--   due_date      — genuine. The UI has a `pending` status, which only means
--                   something if a scheduled payment can carry a due date.
--
--   payment_status— NOT added. `payments.status` already exists with
--                   (pending, completed, failed, refunded), which is exactly
--                   what the UI's payment_status carries. Adding a second
--                   status column would create the split-brain that made
--                   tenants.primary_color vs tenant_features.primary_color a
--                   bug (migration 255). The API maps it onto `status`.
-- ============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) NOT NULL DEFAULT 'full_payment',
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Same vocabulary as booking_payments.payment_type (100_create_bookings.sql:167).
-- Added separately so re-running the migration cannot fail on a duplicate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_payment_type_check'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_payment_type_check
      CHECK (payment_type IN ('deposit', 'installment', 'balance', 'full_payment', 'refund', 'penalty'));
  END IF;
END $$;

-- A pending payment is looked up by when it falls due (dashboards, reminders).
CREATE INDEX IF NOT EXISTS idx_payments_due_date
  ON payments (tenant_id, due_date)
  WHERE due_date IS NOT NULL;

COMMENT ON COLUMN payments.payment_type IS
  'deposit | installment | balance | full_payment | refund | penalty. Same '
  'vocabulary as booking_payments.payment_type.';
COMMENT ON COLUMN payments.due_date IS
  'When a scheduled (status=pending) payment is expected. NULL for payments '
  'already taken. Never treat NULL as overdue — see lib/invoice-dates.ts.';
COMMENT ON COLUMN payments.status IS
  'pending | completed | failed | refunded. The ONLY status on this table — '
  'the UI''s "payment_status" field maps here (migration 257). Do not add a '
  'second status column.';

-- ============================================================================
-- Verify after applying:
--   Record a payment from /payments/new — it should succeed (it has never
--   worked before), and the row should carry the chosen payment_type.
-- ============================================================================
