-- ============================================
-- 429: payments on one invoice are recorded one at a time, and once
-- ============================================
-- The balance trigger (006, update_invoice_on_payment) sums invoice_payments
-- without locking the invoice. Two payments of 500 on a 1,000 invoice saved
-- at the same moment each saw only their own row: the invoice ended
-- amount_paid 500, balance 500, partially_paid — while fully paid. The API's
-- over-payment check read a stale balance, so two at once could also
-- over-pay; and a retried request recorded the same payment twice.
--
-- A BEFORE INSERT trigger now locks the invoice row first. A second payment
-- on the same invoice waits for the first to commit, then sees it — both in
-- the over-payment check here and in the balance trigger's sum (each
-- statement in a plpgsql function takes a fresh snapshot). An optional
-- idempotency key makes a retried request a no-op duplicate.

BEGIN;

CREATE OR REPLACE FUNCTION public.lock_invoice_for_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT balance_due INTO v_balance
  FROM invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  -- Refunds and corrections (zero or negative) are never capped.
  IF NEW.amount > 0 AND v_balance IS NOT NULL AND NEW.amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'Payment amount exceeds balance due (%)', v_balance
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_invoice_for_payment ON public.invoice_payments;
CREATE TRIGGER trg_lock_invoice_for_payment
  BEFORE INSERT ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.lock_invoice_for_payment();

ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_idempotency
  ON public.invoice_payments (invoice_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
