-- ============================================================================
-- 400 — "Tab" is a payment method
-- ============================================================================
--
-- The payment forms offered "Tab", but both payment tables only accepted
-- bank_transfer, cash, credit_card, paypal, stripe and other (their CHECKs,
-- migration 006), so a payment recorded as Tab failed on save. The agency
-- takes Tab: the CHECK now accepts it. (Wise and Airwallex are no longer
-- offered at all, so they are not added.)
--
-- The 006 CHECKs are unnamed column constraints, so each is found by what it
-- checks rather than by a guessed name, then replaced with a named one.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t TEXT;
  c RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['payments', 'invoice_payments'] LOOP
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = t
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%payment_method%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c.conname);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('bank_transfer', 'cash', 'credit_card', 'paypal', 'stripe', 'tab', 'other'));

ALTER TABLE public.invoice_payments
  ADD CONSTRAINT invoice_payments_payment_method_check
  CHECK (payment_method IN ('bank_transfer', 'cash', 'credit_card', 'paypal', 'stripe', 'tab', 'other'));

COMMIT;
