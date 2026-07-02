-- ============================================
-- UNIQUE constraints on business document identifiers
-- ============================================
-- The sibling app generates expense_number, invoice_number, and
-- internal_reference via `rpc('nextval', { seq_name })` or
-- `generate_quote_number()` with NO DB-level uniqueness constraint and
-- NO retry on collision. If the sequence and the table's MAX ever drift
-- (data import, partial restore, sequence reset) the next nextval can
-- collide with an existing row. Two concurrent POSTs that both fall
-- through to a count-based fallback would also collide.
--
-- This migration:
--   1. Adds UNIQUE constraints (idempotently) on the three columns.
--   2. Pre-flights for existing duplicates and raises a clear error so
--      the operator can clean them up before re-running.
--
-- The matching app code (lib/document-numbering.ts + the POST handlers)
-- retries on a 23505 unique_violation so the DB-level constraint and
-- the per-request retry together survive concurrent writes without
-- ever emitting a duplicate identifier.
--
-- Ported from sibling app 20260624_unique_document_numbers.sql.
-- Date: 2026-06-26
-- ============================================

do $$
declare
  dup_expense int;
  dup_invoice int;
  dup_si int;
begin
  -- Pre-flight duplicate checks. If any of these are > 0, the ADD CONSTRAINT
  -- below would fail with a confusing message; surface it cleanly instead.
  select count(*) - count(distinct expense_number) into dup_expense
    from public.expenses
    where expense_number is not null;
  if dup_expense > 0 then
    raise exception 'Cannot add UNIQUE on expenses.expense_number: % duplicate value(s) exist. Reconcile before re-running.', dup_expense;
  end if;

  select count(*) - count(distinct invoice_number) into dup_invoice
    from public.invoices
    where invoice_number is not null;
  if dup_invoice > 0 then
    raise exception 'Cannot add UNIQUE on invoices.invoice_number: % duplicate value(s) exist. Reconcile before re-running.', dup_invoice;
  end if;

  select count(*) - count(distinct internal_reference) into dup_si
    from public.supplier_invoices
    where internal_reference is not null;
  if dup_si > 0 then
    raise exception 'Cannot add UNIQUE on supplier_invoices.internal_reference: % duplicate value(s) exist. Reconcile before re-running.', dup_si;
  end if;
end$$;

-- expenses.expense_number
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_expense_number_key'
  ) then
    alter table public.expenses
      add constraint expenses_expense_number_key unique (expense_number);
  end if;
end$$;

-- invoices.invoice_number
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_invoice_number_key'
  ) then
    alter table public.invoices
      add constraint invoices_invoice_number_key unique (invoice_number);
  end if;
end$$;

-- supplier_invoices.internal_reference
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'supplier_invoices_internal_reference_key'
  ) then
    alter table public.supplier_invoices
      add constraint supplier_invoices_internal_reference_key unique (internal_reference);
  end if;
end$$;

-- ============================================
-- MIGRATION COMPLETE
-- Apply BEFORE deploying the matching app changes. The retry loop in
-- lib/document-numbering.ts relies on the 23505 error code these
-- constraints produce.
-- ============================================
