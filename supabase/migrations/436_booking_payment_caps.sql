-- ============================================
-- 436: payments that keep the books straight
-- ============================================
-- (1) A booking payment cannot overpay, and a refund cannot exceed what was
--     paid (below).
-- (2) Deleting an invoice payment recomputes the invoice in the database,
--     under the same row lock as a new payment (429). The route used to
--     re-read and write the totals itself, unlocked, so a payment recorded at
--     the same moment could leave the invoice showing money no payment row
--     backs.
--
-- (1):
-- record_booking_payment (388) recorded any positive amount. Invoices are
-- capped under a row lock (429); bookings were not. Same function, with the
-- checks added after the booking row is locked. The route answers 23514 with
-- a 409 and the amount still owed.

BEGIN;

create or replace function public.record_booking_payment(
  p_booking_id uuid,
  p_tenant_id uuid,
  p_payment_number text,
  p_amount numeric,
  p_payment_type text,
  p_payment_method text,
  p_payment_date date,
  p_transaction_reference text,
  p_notes text,
  p_created_by uuid
) returns table (
  payment_id uuid,
  payment_number text,
  new_total_paid numeric,
  new_balance_due numeric,
  new_status text
)
language plpgsql
as $$
declare
  v_booking record;
  v_payment_id uuid;
  v_new_total_paid numeric;
  v_new_balance_due numeric;
  v_new_status text;
begin
  -- Lock the booking row for the rest of the transaction. Concurrent
  -- record_booking_payment calls on the same booking_id serialize here.
  select id, tenant_id, currency, total_amount, total_paid, deposit_amount,
         status, confirmation_date, full_payment_date
    into v_booking
    from public.bookings
    where id = p_booking_id
      and tenant_id = p_tenant_id
    for update;

  if not found then
    raise exception 'Booking % not found for tenant %', p_booking_id, p_tenant_id;
  end if;

  -- Under the lock, so two payments at once see each other (migration 436).
  -- Money in is capped at what is still owed; a refund at what was paid.
  -- A mistyped 10,000 on a 1,000 booking was accepted and the overpayment
  -- hidden (balance shown as 0); a refund larger than the payments made
  -- total_paid negative.
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive' using errcode = '23514';
  end if;
  if p_payment_type = 'refund' then
    if p_amount > coalesce(v_booking.total_paid, 0) + 0.01 then
      raise exception 'Refund exceeds the amount paid (%)', coalesce(v_booking.total_paid, 0) using errcode = '23514';
    end if;
  elsif p_payment_type <> 'penalty' then
    if p_amount > coalesce(v_booking.total_amount, 0) - coalesce(v_booking.total_paid, 0) + 0.01 then
      raise exception 'Payment exceeds the balance due (%)',
        greatest(0, coalesce(v_booking.total_amount, 0) - coalesce(v_booking.total_paid, 0)) using errcode = '23514';
    end if;
  end if;

  -- Insert the payment. We pass payment_number rather than generating it
  -- inside the RPC so the route can keep its existing generate_payment_number
  -- RPC call (which it already retries via insertWithUniqueRetry after the
  -- companion document-numbering migration adds UNIQUE constraints).
  insert into public.booking_payments (
    tenant_id, booking_id, payment_number, amount, currency,
    payment_type, payment_method, payment_date, status,
    transaction_reference, notes, created_by
  ) values (
    p_tenant_id, p_booking_id, p_payment_number, p_amount,
    v_booking.currency, p_payment_type, p_payment_method, p_payment_date,
    'received', p_transaction_reference, p_notes, p_created_by
  )
  returning id into v_payment_id;

  -- Recompute total_paid in the booking's currency from the ledger. Refunds
  -- and penalties subtract; deposit/installment/balance/full_payment add.
  -- Currency match guards against legacy rows poisoning the SUM.
  select coalesce(sum(
    case when payment_type in ('refund', 'penalty') then -amount else amount end
  ), 0)
    into v_new_total_paid
    from public.booking_payments
    where booking_id = p_booking_id
      and coalesce(currency, v_booking.currency) = v_booking.currency;

  -- Write the booking back. balance_due, the status and its first-reached
  -- dates are all derived by the bookings trigger (calculate_booking_balance)
  -- from the money. The status (and its first-reached dates) follow from the money in the
  -- bookings trigger (booking_payment_status, migration 388) — one rule for
  -- payments, refunds, extras and added travellers alike.
  update public.bookings
    set total_paid = v_new_total_paid,
        updated_at = now()
    where id = p_booking_id
    returning status, greatest(0, balance_due) into v_new_status, v_new_balance_due;

  return query select v_payment_id, p_payment_number, v_new_total_paid,
                      v_new_balance_due, v_new_status;
end$$;

revoke all on function public.record_booking_payment(uuid, uuid, text, numeric, text, text, date, text, text, uuid) from public;
grant execute on function public.record_booking_payment(uuid, uuid, text, numeric, text, text, date, text, text, uuid) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.invoice_after_payment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_status TEXT;
  v_paid NUMERIC;
BEGIN
  SELECT total_amount, status INTO v_total, v_status
  FROM invoices WHERE id = OLD.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN OLD;  -- the invoice itself is being deleted
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM invoice_payments WHERE invoice_id = OLD.invoice_id;

  UPDATE invoices SET
    amount_paid = v_paid,
    balance_due = GREATEST(COALESCE(v_total, 0) - v_paid, 0),
    status = CASE
      WHEN v_status IN ('draft', 'cancelled') THEN v_status
      WHEN v_paid > 0 AND v_paid >= COALESCE(v_total, 0) - 0.01 THEN 'paid'
      WHEN v_paid > 0 THEN 'partially_paid'
      ELSE 'sent'
    END,
    paid_at = CASE WHEN v_paid > 0 AND v_paid >= COALESCE(v_total, 0) - 0.01 THEN paid_at ELSE NULL END,
    updated_at = NOW()
  WHERE id = OLD.invoice_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_after_payment_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_invoice_after_payment_delete ON public.invoice_payments;
CREATE TRIGGER trg_invoice_after_payment_delete
  AFTER DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.invoice_after_payment_delete();

COMMIT;
