-- ============================================
-- 447: service bookings speak only the new states (Phase 1, step 2)
-- ============================================
-- 446 let the new states (requested / accepted / assigned / done / declined /
-- expired) in beside the old words so the live app kept working. This step
-- rewrites the stored rows and narrows the list to the new states:
--
--   contacted   → requested
--   confirmed   → accepted
--   no_response → expired
--
-- A guard keeps translating the old words on write, so an older copy of the
-- app still running while this deploys (or any forgotten writer) saves the
-- new word instead of failing. The meaning of each row is unchanged, so no
-- event is written for the rewrite.
--
-- Replay-safe.

BEGIN;

CREATE OR REPLACE FUNCTION public.booking_supplier_status_new_words()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status := CASE NEW.status
    WHEN 'contacted' THEN 'requested'
    WHEN 'confirmed' THEN 'accepted'
    WHEN 'no_response' THEN 'expired'
    ELSE NEW.status
  END;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_booking_supplier_status_new_words ON public.booking_supplier_status;
CREATE TRIGGER trg_booking_supplier_status_new_words
  BEFORE INSERT OR UPDATE OF status ON public.booking_supplier_status
  FOR EACH ROW EXECUTE FUNCTION public.booking_supplier_status_new_words();

-- Rewrite (the guard does the translating).
UPDATE public.booking_supplier_status
   SET status = status
 WHERE status IN ('contacted', 'confirmed', 'no_response');

ALTER TABLE public.booking_supplier_status
  DROP CONSTRAINT IF EXISTS booking_supplier_status_status_check;
ALTER TABLE public.booking_supplier_status
  ADD CONSTRAINT booking_supplier_status_status_check
  CHECK (status IN (
    'pending', 'requested', 'accepted', 'assigned', 'done',
    'declined', 'expired', 'cancelled'
  ));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.booking_supplier_status
     WHERE status IN ('contacted', 'confirmed', 'no_response')
  ) THEN
    RAISE EXCEPTION '447: an old status word is still stored';
  END IF;
END $$;

COMMIT;
