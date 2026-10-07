-- ============================================================================
-- 388 — A booking's payment status follows its money, whoever changes it
-- ============================================================================
-- The status (pending_deposit → confirmed → paid_full) was decided only
-- inside record_booking_payment(), and wrongly:
--   * a refund on a paid_full booking left it paid_full;
--   * a payment clearing the balance of a CANCELLED booking made it paid_full;
--   * a first payment not typed 'deposit' never confirmed the booking, even
--     when it covered the deposit;
--   * extras and added travellers raise total_amount (booking extras,
--     change requests) but never touched the status — paid_full with a
--     balance still due.
-- (Found comparing the booking module with travel-ops-pro, 2026-09-25. Live
-- had one booking and no payments, so nothing to repair.)
--
-- Now ONE rule, booking_payment_status(), applied by the bookings trigger
-- that already derives balance_due, on any change to total_amount,
-- total_paid or deposit_amount:
--   * only the money statuses move — in_progress / completed / cancelled
--     are the operator's and are never touched;
--   * paid in full (total > 0, paid >= total)        → paid_full
--   * the deposit reached (or any payment, no deposit) → confirmed
--   * once confirmed, a refund or a larger total does not un-confirm it
--     (paid_full falls back to confirmed); otherwise   → pending_deposit
-- The first time a booking reaches confirmed / paid_full the date is stamped.
-- record_booking_payment() no longer decides the status; it returns the one
-- the trigger set.

create or replace function public.booking_payment_status(
  p_status text, p_total numeric, p_paid numeric, p_deposit numeric
) returns text
language sql
immutable
as $$
  select case
    when p_status not in ('pending_deposit', 'confirmed', 'paid_full') then p_status
    when coalesce(p_total, 0) > 0 and coalesce(p_paid, 0) >= p_total then 'paid_full'
    when coalesce(p_paid, 0) > 0
         and coalesce(p_paid, 0) >= coalesce(nullif(p_deposit, 0), 0) then 'confirmed'
    when p_status in ('confirmed', 'paid_full') then 'confirmed'
    else 'pending_deposit'
  end
$$;

create or replace function public.calculate_booking_balance()
returns trigger
language plpgsql
as $$
begin
  NEW.balance_due := NEW.total_amount - NEW.total_paid;
  NEW.status := public.booking_payment_status(
    NEW.status, NEW.total_amount, NEW.total_paid, NEW.deposit_amount
  );
  if NEW.status in ('confirmed', 'paid_full') and NEW.confirmation_date is null then
    NEW.confirmation_date := current_date;
  end if;
  if NEW.status = 'paid_full' and NEW.full_payment_date is null then
    NEW.full_payment_date := current_date;
  end if;
  return NEW;
end;
$$;

drop trigger if exists calculate_balance_trigger on public.bookings;
create trigger calculate_balance_trigger
  before insert or update of total_amount, total_paid, deposit_amount
  on public.bookings
  for each row execute function public.calculate_booking_balance();

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
