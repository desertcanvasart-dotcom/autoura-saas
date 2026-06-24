-- ============================================
-- Atomic booking-payment recording
-- ============================================
-- POST /api/bookings/[id]/payments used to (1) generate a payment number,
-- (2) INSERT a booking_payments row, then (3) UPDATE the parent booking's
-- total_paid / status / dates based on a read-side snapshot. Three separate
-- PostgREST round-trips with no row lock — so two concurrent payments on
-- the same booking (e.g. a double-clicked "Record payment" button or a
-- deposit + balance recorded simultaneously) could:
--   - both read a stale total_paid,
--   - both compute the wrong new_total_paid,
--   - both UPDATE the booking, last write wins.
-- Symptoms: total_paid not reflecting both payments, status stuck on
-- pending_deposit when it should be confirmed, confirmation_date set on
-- the wrong payment, or paid_full transition missed entirely. Both
-- ledger rows survive, so the booking's denormalized total_paid silently
-- disagrees with the SUM(booking_payments.amount) for the booking.
--
-- This function moves the whole sequence inside a single PL/pgSQL
-- transaction with SELECT ... FOR UPDATE on the booking row, so
-- concurrent callers serialize on this booking_id. A currency check
-- keeps mixed-currency rows from poisoning the SUM, even though the
-- application normally enforces single-currency per booking.
--
-- This RPC is adapted from a sibling app for the autoura-saas schema:
-- bookings uses (total_amount, total_paid, balance_due, status) with
-- balance_due auto-computed by an existing BEFORE INSERT/UPDATE trigger,
-- so the RPC writes total_paid and the trigger handles balance_due.
-- Status transitions follow the existing route logic exactly:
--   pending_deposit + deposit payment → confirmed (+ confirmation_date)
--   any status + balance_due <= 0 → paid_full (+ full_payment_date)
--
-- Date: 2026-06-26
-- ============================================

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
  v_confirmation_date date := null;
  v_full_payment_date date := null;
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

  v_new_balance_due := greatest(0, coalesce(v_booking.total_amount, 0) - v_new_total_paid);

  -- Status transitions — match the route's prior logic exactly.
  v_new_status := v_booking.status;
  if p_payment_type = 'deposit' and v_booking.status = 'pending_deposit' then
    v_new_status := 'confirmed';
    if v_booking.confirmation_date is null then
      v_confirmation_date := current_date;
    end if;
  end if;
  if v_new_balance_due <= 0 then
    v_new_status := 'paid_full';
    if v_booking.full_payment_date is null then
      v_full_payment_date := current_date;
    end if;
  end if;

  -- Write the booking back. balance_due is auto-computed by the existing
  -- BEFORE INSERT/UPDATE trigger on (total_amount, total_paid), so we only
  -- write total_paid and let the trigger reconcile balance_due.
  -- confirmation_date / full_payment_date are set ONLY on the first
  -- transition (when v_*_date is non-null), so re-runs don't clobber the
  -- original transition date.
  update public.bookings
    set total_paid = v_new_total_paid,
        status = v_new_status,
        confirmation_date = coalesce(v_confirmation_date, confirmation_date),
        full_payment_date = coalesce(v_full_payment_date, full_payment_date),
        updated_at = now()
    where id = p_booking_id;

  return query select v_payment_id, p_payment_number, v_new_total_paid,
                      v_new_balance_due, v_new_status;
end$$;

-- Allow the authenticated client + service role to call this RPC.
revoke all on function public.record_booking_payment(uuid, uuid, text, numeric, text, text, date, text, text, uuid) from public;
grant execute on function public.record_booking_payment(uuid, uuid, text, numeric, text, text, date, text, text, uuid) to service_role, authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- After this lands, app/api/bookings/[id]/payments/route.ts POST should
-- call this RPC instead of inserting and recomputing in three steps.
-- ============================================
