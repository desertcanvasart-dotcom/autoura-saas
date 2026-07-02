-- =====================================================
-- Migration 220: reconcile accommodation rate columns (schema split-brain)
-- =====================================================
-- The bulk rate importer (lib/bulk-rate-service.ts) writes one column family:
--   pp_double_eur, single_supp_eur, triple_red_eur
--   high_pp_double_eur, high_single_supp_eur, high_triple_red_eur
--   peak_pp_double_eur, peak_single_supp_eur, peak_triple_red_eur   (migration 200)
-- The pricing engine (lib/auto-pricing-service.ts getHotelRates) reads a
-- DIFFERENT family:
--   ppd_eur, single_supplement_eur, triple_reduction_eur
--   high_season_ppd_eur, high_season_single_supplement_eur, high_season_triple_reduction_eur
--   peak_season_ppd_eur, peak_season_single_supplement_eur, peak_season_triple_reduction_eur (migration 104)
-- Both DEFAULT 0, so a hotel imported via the bulk path has ppd_eur = 0 and
-- prices at €0 / registers as a pricing hole — the imported rate is invisible.
--
-- We keep the importer's columns as-is (they're also read by
-- app/api/b2b/quote-from-itinerary and exported by the bulk service, so we do
-- NOT rename them). Instead we make the engine columns a mirror of the
-- importer columns:
--   1. one-time backfill of existing rows, then
--   2. a BEFORE INSERT/UPDATE trigger so every future import keeps them in sync.
-- The season-boundary columns (*_from/*_to) already match on both sides
-- (migration 103), so only the rate values need reconciling.

-- --- 1. Backfill existing rows (only where the engine col is empty/zero) ---
UPDATE accommodation_rates SET
  ppd_eur                            = CASE WHEN COALESCE(ppd_eur,0) = 0                            AND COALESCE(pp_double_eur,0) <> 0      THEN pp_double_eur      ELSE ppd_eur END,
  single_supplement_eur              = CASE WHEN COALESCE(single_supplement_eur,0) = 0              AND COALESCE(single_supp_eur,0) <> 0    THEN single_supp_eur    ELSE single_supplement_eur END,
  triple_reduction_eur               = CASE WHEN COALESCE(triple_reduction_eur,0) = 0               AND COALESCE(triple_red_eur,0) <> 0     THEN triple_red_eur     ELSE triple_reduction_eur END,
  high_season_ppd_eur                = CASE WHEN COALESCE(high_season_ppd_eur,0) = 0                 AND COALESCE(high_pp_double_eur,0) <> 0 THEN high_pp_double_eur ELSE high_season_ppd_eur END,
  high_season_single_supplement_eur  = CASE WHEN COALESCE(high_season_single_supplement_eur,0) = 0  AND COALESCE(high_single_supp_eur,0) <> 0 THEN high_single_supp_eur ELSE high_season_single_supplement_eur END,
  high_season_triple_reduction_eur   = CASE WHEN COALESCE(high_season_triple_reduction_eur,0) = 0   AND COALESCE(high_triple_red_eur,0) <> 0 THEN high_triple_red_eur ELSE high_season_triple_reduction_eur END,
  peak_season_ppd_eur                = CASE WHEN COALESCE(peak_season_ppd_eur,0) = 0                 AND COALESCE(peak_pp_double_eur,0) <> 0 THEN peak_pp_double_eur ELSE peak_season_ppd_eur END,
  peak_season_single_supplement_eur  = CASE WHEN COALESCE(peak_season_single_supplement_eur,0) = 0  AND COALESCE(peak_single_supp_eur,0) <> 0 THEN peak_single_supp_eur ELSE peak_season_single_supplement_eur END,
  peak_season_triple_reduction_eur   = CASE WHEN COALESCE(peak_season_triple_reduction_eur,0) = 0   AND COALESCE(peak_triple_red_eur,0) <> 0 THEN peak_triple_red_eur ELSE peak_season_triple_reduction_eur END;

-- --- 2. Keep them synced on every future write ---
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
