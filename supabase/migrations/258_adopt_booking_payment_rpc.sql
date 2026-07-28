-- ============================================================================
-- 258 — adopt record_booking_payment, and close the split-brain
-- ============================================================================
--
-- This repo had TWO migration directories:
--   supabase/migrations/  — 148 files, the ones actually applied
--   migrations/           — 2 files, added 2026-06-26, NEVER applied
--
-- Nothing recorded which was canonical, so "which migrations are live?" had
-- no answer. Verified against production: `record_booking_payment` does not
-- exist (PGRST202), so POST /api/bookings/[id]/payments — which calls it —
-- has returned 500 since the day that route shipped.
--
-- The two orphaned files were NOT equal in value, so they are not treated
-- equally here:
--
--   * record_booking_payment  — ADOPTED below, verbatim. It is correct, and
--     it fixes a genuine race: the route used to insert the payment and then
--     recompute the booking's total_paid in separate round-trips with no row
--     lock, so two concurrent payments could both read a stale total and the
--     last write would win. The RPC does it under SELECT ... FOR UPDATE.
--
--   * 20260626_unique_document_numbers.sql — REJECTED, and deleted in this
--     commit. It adds GLOBALLY unique constraints on invoice_number,
--     expense_number and internal_reference. Its own header says it was
--     ported from a sibling app; this app is MULTI-TENANT, and those are
--     per-tenant identifiers. 006 already declares
--     UNIQUE(tenant_id, invoice_number) and UNIQUE(tenant_id, expense_number),
--     which is the correct shape.
--
--     Applying it would have bricked new tenants: lib/document-numbering.ts
--     scans with an RLS-scoped client, so tenant B — seeing none of tenant
--     A's rows — generates INV-2026-001, collides with A's globally-unique
--     001, and insertWithUniqueRetry rescans B's still-empty set and
--     regenerates the SAME number. Five attempts, same collision, permanent
--     500. Tenant B could never create an invoice.
--
-- What that migration was RIGHT about is that supplier_invoices had no
-- uniqueness at all on internal_reference, so its retry loop had nothing to
-- retry against. Added below in the correct per-tenant shape.
-- ============================================================================

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


-- ============================================================================
-- The one good idea from the rejected migration, in the correct shape.
-- supplier_invoices.internal_reference had NO uniqueness (216 declares it as
-- a bare TEXT), so insertWithUniqueRetry's 23505 handler could never fire.
-- Per-tenant, not global — two operators may both have SI-2026-001.
-- ============================================================================

DO $$
DECLARE
  dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT tenant_id, internal_reference
    FROM supplier_invoices
    WHERE internal_reference IS NOT NULL
    GROUP BY tenant_id, internal_reference
    HAVING COUNT(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot add the unique constraint: % tenant/reference pair(s) are duplicated. '
      'Find them with: SELECT tenant_id, internal_reference, COUNT(*) FROM supplier_invoices '
      'WHERE internal_reference IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1;', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_tenant_reference
  ON supplier_invoices (tenant_id, internal_reference)
  WHERE internal_reference IS NOT NULL;

-- ============================================================================
-- Verify after applying:
--   SELECT proname FROM pg_proc WHERE proname = 'record_booking_payment';
--   Record a payment against a booking — it has returned 500 until now.
-- ============================================================================
