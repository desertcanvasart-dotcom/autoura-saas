-- Migration 330: Two-way backfill of the nile_cruises column families
--
-- Same disease migration 329 cured for accommodation_rates: the bulk CSV
-- writes whole-trip PER-PERSON rates by occupancy (rate_low_double_eur …)
-- while the engine, the form, and the periods model read per-person
-- PER-NIGHT figures (ppd_eur …). Rows born through one surface were
-- invisible or unpriceable through the other.
--
-- The bridge (locked 2026-09-05, sibling-verified semantics — these
-- columns are per-PERSON, not per-cabin):
--   ppd/night           = double_trip / nights
--   single supp/night   = (single_trip - double_trip) / nights
--   triple red/night    = (double_trip - triple_trip) / nights
-- and the reverse for CSV-facing columns. nights = duration_nights,
-- defaulting to 4 (the engine's own default). Only 0/NULL holes are
-- filled — an explicit number on either side is never overwritten.
-- Idempotent by construction.

DO $$
DECLARE
  pair RECORD;
  -- duration_nights is historically JSONB on this table; #>>'{}' unwraps
  -- both a bare number and a quoted one before the numeric cast.
  n TEXT := 'GREATEST(COALESCE(NULLIF(duration_nights #>> ''{}'', '''')::numeric, 4), 1)';
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('low',  ''),
      ('high', 'high_season_'),
      ('peak', 'peak_season_')
    ) AS t(csv_season, engine_prefix)
  LOOP
    FOR i IN 1..2 LOOP
      DECLARE p TEXT := CASE WHEN i = 1 THEN 'eur' ELSE 'non_eur' END;
      BEGIN
        -- CSV → engine: ppd/night from the per-person double trip rate.
        EXECUTE format(
          'UPDATE nile_cruises SET %I = %I / %s
             WHERE COALESCE(%I, 0) = 0 AND COALESCE(%I, 0) > 0',
          pair.engine_prefix || 'ppd_' || p, 'rate_' || pair.csv_season || '_double_' || p, n,
          pair.engine_prefix || 'ppd_' || p, 'rate_' || pair.csv_season || '_double_' || p
        );
        EXECUTE format(
          'UPDATE nile_cruises SET %I = GREATEST(0, (%I - %I) / %s)
             WHERE COALESCE(%I, 0) = 0 AND COALESCE(%I, 0) > 0 AND COALESCE(%I, 0) > 0',
          pair.engine_prefix || 'single_supplement_' || p,
          'rate_' || pair.csv_season || '_single_' || p, 'rate_' || pair.csv_season || '_double_' || p, n,
          pair.engine_prefix || 'single_supplement_' || p,
          'rate_' || pair.csv_season || '_single_' || p, 'rate_' || pair.csv_season || '_double_' || p
        );
        EXECUTE format(
          'UPDATE nile_cruises SET %I = GREATEST(0, (%I - %I) / %s)
             WHERE COALESCE(%I, 0) = 0 AND COALESCE(%I, 0) > 0 AND COALESCE(%I, 0) > 0',
          pair.engine_prefix || 'triple_reduction_' || p,
          'rate_' || pair.csv_season || '_double_' || p, 'rate_' || pair.csv_season || '_triple_' || p, n,
          pair.engine_prefix || 'triple_reduction_' || p,
          'rate_' || pair.csv_season || '_triple_' || p, 'rate_' || pair.csv_season || '_double_' || p
        );

        -- engine → CSV: the reverse, so form-created cruises export real numbers.
        EXECUTE format(
          'UPDATE nile_cruises SET %I = %I * %s
             WHERE COALESCE(%I, 0) = 0 AND COALESCE(%I, 0) > 0',
          'rate_' || pair.csv_season || '_double_' || p, pair.engine_prefix || 'ppd_' || p, n,
          'rate_' || pair.csv_season || '_double_' || p, pair.engine_prefix || 'ppd_' || p
        );
        EXECUTE format(
          'UPDATE nile_cruises SET %I = (%I + COALESCE(%I, 0)) * %s
             WHERE COALESCE(%I, 0) = 0 AND COALESCE(%I, 0) > 0',
          'rate_' || pair.csv_season || '_single_' || p,
          pair.engine_prefix || 'ppd_' || p, pair.engine_prefix || 'single_supplement_' || p, n,
          'rate_' || pair.csv_season || '_single_' || p, pair.engine_prefix || 'ppd_' || p
        );
        EXECUTE format(
          'UPDATE nile_cruises SET %I = GREATEST(0, (%I - COALESCE(%I, 0)) * %s)
             WHERE COALESCE(%I, 0) = 0 AND COALESCE(%I, 0) > 0',
          'rate_' || pair.csv_season || '_triple_' || p,
          pair.engine_prefix || 'ppd_' || p, pair.engine_prefix || 'triple_reduction_' || p, n,
          'rate_' || pair.csv_season || '_triple_' || p, pair.engine_prefix || 'ppd_' || p
        );
      END;
    END LOOP;
  END LOOP;
END $$;
