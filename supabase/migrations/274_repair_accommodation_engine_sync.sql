-- ============================================================================
-- 274 — repair: migration 220's sync trigger was never created
-- ============================================================================
--
-- Found by check 14 (scripts/sql-checks/check-14-diff.sh) on 2026-08-23:
-- trg_sync_accommodation_engine_columns is declared in migration 220 and is
-- NOT present in the production database. Neither is the function it calls —
-- sync_accommodation_engine_columns() does not exist at all, so 220's second
-- half never executed.
--
-- schema_migrations claims 220 was applied (2026-07-16 16:46:10, the same
-- timestamp as 000, 030, 119 and 120 — a bulk backfill of rows asserting that
-- migrations had run). It is a record of intent, not of execution. The columns
-- 220 reconciles do exist, but they come from 104 and 200; nothing 220 itself
-- creates is present.
--
-- ── Why it matters ──────────────────────────────────────────────────────────
-- Quoting 220's own header: the bulk rate importer writes one column family
--
--   pp_double_eur, single_supp_eur, triple_red_eur (+ high_/peak_ variants)
--
-- and the pricing engine (lib/auto-pricing-service.ts getHotelRates) reads a
-- different one
--
--   ppd_eur, single_supplement_eur, triple_reduction_eur (+ variants)
--
-- Both DEFAULT 0. Without the trigger a bulk-imported hotel has ppd_eur = 0,
-- so it prices at EUR 0 and registers as a pricing hole rather than an error —
-- the imported rate is invisible.
--
-- accommodation_rates is empty today, so nothing has been mispriced. This is
-- armed, not fired: it goes off on the first bulk import.
--
-- ── Why a new migration rather than re-running 220 ──────────────────────────
-- 220 is correct and a fresh build would run it. What it lacks is a post-check,
-- which is precisely why its silent non-application went unnoticed for weeks.
-- This repairs the live database AND asserts the outcome, so the same failure
-- cannot repeat quietly. Everything here is idempotent.
-- ============================================================================

BEGIN;

-- --- 1. The function 220 defines (absent in production) --------------------
CREATE OR REPLACE FUNCTION sync_accommodation_engine_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- A non-zero importer value is the source of truth (the bulk importer writes
  -- the pp_double_* family); otherwise leave any directly-set engine value.
  NEW.ppd_eur                           := COALESCE(NULLIF(NEW.pp_double_eur, 0),      NEW.ppd_eur);
  NEW.single_supplement_eur             := COALESCE(NULLIF(NEW.single_supp_eur, 0),    NEW.single_supplement_eur);
  NEW.triple_reduction_eur              := COALESCE(NULLIF(NEW.triple_red_eur, 0),     NEW.triple_reduction_eur);
  NEW.high_season_ppd_eur               := COALESCE(NULLIF(NEW.high_pp_double_eur, 0), NEW.high_season_ppd_eur);
  NEW.high_season_single_supplement_eur := COALESCE(NULLIF(NEW.high_single_supp_eur, 0), NEW.high_season_single_supplement_eur);
  NEW.high_season_triple_reduction_eur  := COALESCE(NULLIF(NEW.high_triple_red_eur, 0), NEW.high_season_triple_reduction_eur);
  NEW.peak_season_ppd_eur               := COALESCE(NULLIF(NEW.peak_pp_double_eur, 0), NEW.peak_season_ppd_eur);
  NEW.peak_season_single_supplement_eur := COALESCE(NULLIF(NEW.peak_single_supp_eur, 0), NEW.peak_season_single_supplement_eur);
  NEW.peak_season_triple_reduction_eur  := COALESCE(NULLIF(NEW.peak_triple_red_eur, 0), NEW.peak_season_triple_reduction_eur);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_accommodation_engine_columns ON accommodation_rates;
CREATE TRIGGER trg_sync_accommodation_engine_columns
  BEFORE INSERT OR UPDATE ON accommodation_rates
  FOR EACH ROW
  EXECUTE FUNCTION sync_accommodation_engine_columns();

-- --- 2. Backfill any row the missing trigger already let through -----------
-- A no-op while the table is empty; correct if rows were imported before this
-- lands. Only fills an engine column that is zero/NULL — never overwrites a
-- deliberately-set value.
UPDATE accommodation_rates SET
  ppd_eur                           = CASE WHEN COALESCE(ppd_eur,0) = 0                           AND COALESCE(pp_double_eur,0)      <> 0 THEN pp_double_eur      ELSE ppd_eur END,
  single_supplement_eur             = CASE WHEN COALESCE(single_supplement_eur,0) = 0             AND COALESCE(single_supp_eur,0)    <> 0 THEN single_supp_eur    ELSE single_supplement_eur END,
  triple_reduction_eur              = CASE WHEN COALESCE(triple_reduction_eur,0) = 0              AND COALESCE(triple_red_eur,0)     <> 0 THEN triple_red_eur     ELSE triple_reduction_eur END,
  high_season_ppd_eur               = CASE WHEN COALESCE(high_season_ppd_eur,0) = 0               AND COALESCE(high_pp_double_eur,0) <> 0 THEN high_pp_double_eur ELSE high_season_ppd_eur END,
  high_season_single_supplement_eur = CASE WHEN COALESCE(high_season_single_supplement_eur,0) = 0 AND COALESCE(high_single_supp_eur,0) <> 0 THEN high_single_supp_eur ELSE high_season_single_supplement_eur END,
  high_season_triple_reduction_eur  = CASE WHEN COALESCE(high_season_triple_reduction_eur,0) = 0  AND COALESCE(high_triple_red_eur,0) <> 0 THEN high_triple_red_eur ELSE high_season_triple_reduction_eur END,
  peak_season_ppd_eur               = CASE WHEN COALESCE(peak_season_ppd_eur,0) = 0               AND COALESCE(peak_pp_double_eur,0) <> 0 THEN peak_pp_double_eur ELSE peak_season_ppd_eur END,
  peak_season_single_supplement_eur = CASE WHEN COALESCE(peak_season_single_supplement_eur,0) = 0 AND COALESCE(peak_single_supp_eur,0) <> 0 THEN peak_single_supp_eur ELSE peak_season_single_supplement_eur END,
  peak_season_triple_reduction_eur  = CASE WHEN COALESCE(peak_season_triple_reduction_eur,0) = 0  AND COALESCE(peak_triple_red_eur,0) <> 0 THEN peak_triple_red_eur ELSE peak_season_triple_reduction_eur END;

-- --------------------------------------------------------------------------
-- 3. Post-check — the half 220 was missing.
--    Assert the function AND the trigger exist, and that the trigger actually
--    fires: a migration that only claims to have run is what produced this.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  probe_id UUID := gen_random_uuid();
  a_tenant UUID;
  got NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_accommodation_engine_columns') THEN
    RAISE EXCEPTION 'sync_accommodation_engine_columns() was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'accommodation_rates'
      AND t.tgname = 'trg_sync_accommodation_engine_columns'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_sync_accommodation_engine_columns was not created';
  END IF;

  -- Behavioural proof: write a throwaway row with ONLY the importer column set
  -- and require the engine column to come back mirrored. Rolled back either way.
  SELECT id INTO a_tenant FROM tenants LIMIT 1;
  IF a_tenant IS NULL THEN
    RAISE NOTICE 'no tenants row — skipping behavioural probe (structure asserted above)';
  ELSE
    INSERT INTO accommodation_rates (id, tenant_id, pp_double_eur)
    VALUES (probe_id, a_tenant, 123.45);

    SELECT ppd_eur INTO got FROM accommodation_rates WHERE id = probe_id;
    DELETE FROM accommodation_rates WHERE id = probe_id;

    IF got IS DISTINCT FROM 123.45 THEN
      RAISE EXCEPTION 'trigger did not mirror pp_double_eur -> ppd_eur (got %)', got;
    END IF;
    RAISE NOTICE 'behavioural probe passed: pp_double_eur 123.45 -> ppd_eur %', got;
  END IF;
END $$;

COMMIT;
