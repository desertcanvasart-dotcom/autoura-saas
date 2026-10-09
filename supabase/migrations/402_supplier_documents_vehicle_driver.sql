-- ============================================================================
-- 402 — a transport voucher keeps its vehicle and driver
-- ============================================================================
--
-- The voucher PDF has always printed a vehicle-type and driver block for a
-- transport voucher, but supplier_documents had neither column, so nothing
-- could ever fill it. The trip's own services carry both
-- (itinerary_services.vehicle_type, driver_name, migration 132): Generate
-- now copies them onto the voucher, and the edit page can set them.
--
-- Additive and replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE supplier_documents
  ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255);

COMMENT ON COLUMN supplier_documents.vehicle_type IS
  'Transport vouchers: the vehicle class the supplier is to send.';
COMMENT ON COLUMN supplier_documents.driver_name IS
  'Transport vouchers: the driver, once known.';

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_name = 'supplier_documents'
         AND column_name IN ('vehicle_type', 'driver_name')) <> 2 THEN
    RAISE EXCEPTION 'supplier_documents.vehicle_type / driver_name missing';
  END IF;
END $$;

COMMIT;
