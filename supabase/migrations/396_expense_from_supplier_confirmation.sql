-- ============================================
-- 396: an expense made by confirming a booking's supplier
-- ============================================
-- Confirming a supplier on a booking (booking_supplier_status → confirmed)
-- now records what the agency owes them as an expense (lib/bookings/
-- supplier-expense.ts): until then every trip cost had to be typed in by
-- hand, and an un-typed trip showed ~100% margin. This column ties the
-- expense to the row that made it, so a later cost change updates it and an
-- un-confirmation removes it — once, never a second copy.
--
-- ON DELETE SET NULL: removing the supplier row keeps the expense (it may be
-- approved or paid already). Additive and replay-safe.

BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS booking_supplier_status_id uuid
    REFERENCES public.booking_supplier_status(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_booking_supplier_status_id_key
  ON public.expenses (booking_supplier_status_id)
  WHERE booking_supplier_status_id IS NOT NULL;

COMMENT ON COLUMN public.expenses.booking_supplier_status_id IS
  'The booking supplier row whose confirmation created this expense (NULL = entered by hand).';

COMMIT;
