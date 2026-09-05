-- Migration 329: Two-way backfill of the accommodation column families
--
-- accommodation_rates carries two same-unit (per-person-in-double) column
-- families: the ENGINE family (ppd_eur / high_season_ppd_eur / …) read by
-- pricing, the rate form, and the period editor; and the IMPORTER family
-- (pp_double_eur / high_pp_double_eur / …) written by the bulk CSV import
-- and read by the pricing grid. Migration 220 mirrored importer→engine
-- ONCE — every hotel bulk-imported since prices at 0 and opens blank in
-- the form, and every form-created hotel is invisible to the grid and
-- exports blank cells.
--
-- The code now writes both families at the bulk boundary (and the form
-- path has legacyColumnMirror); this backfills EXISTING rows in both
-- directions. A value only ever fills a 0/NULL hole — an explicit number
-- on either side is never overwritten. Idempotent by construction.

DO $$
DECLARE
  pair RECORD;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('pp_double_eur',              'ppd_eur'),
      ('single_supp_eur',            'single_supplement_eur'),
      ('triple_red_eur',             'triple_reduction_eur'),
      ('pp_double_non_eur',          'ppd_non_eur'),
      ('single_supp_non_eur',        'single_supplement_non_eur'),
      ('triple_red_non_eur',         'triple_reduction_non_eur'),
      ('high_pp_double_eur',         'high_season_ppd_eur'),
      ('high_single_supp_eur',       'high_season_single_supplement_eur'),
      ('high_triple_red_eur',        'high_season_triple_reduction_eur'),
      ('high_pp_double_non_eur',     'high_season_ppd_non_eur'),
      ('high_single_supp_non_eur',   'high_season_single_supplement_non_eur'),
      ('high_triple_red_non_eur',    'high_season_triple_reduction_non_eur'),
      ('peak_pp_double_eur',         'peak_season_ppd_eur'),
      ('peak_single_supp_eur',       'peak_season_single_supplement_eur'),
      ('peak_triple_red_eur',        'peak_season_triple_reduction_eur'),
      ('peak_pp_double_non_eur',     'peak_season_ppd_non_eur'),
      ('peak_single_supp_non_eur',   'peak_season_single_supplement_non_eur'),
      ('peak_triple_red_non_eur',    'peak_season_triple_reduction_non_eur')
    ) AS t(importer_col, engine_col)
  LOOP
    -- importer → engine (bulk-imported rows start pricing)
    EXECUTE format(
      'UPDATE accommodation_rates SET %I = %I WHERE COALESCE(%I, 0) = 0 AND COALESCE(%I, 0) > 0',
      pair.engine_col, pair.importer_col, pair.engine_col, pair.importer_col
    );
    -- engine → importer (form-created rows appear in the grid and export)
    EXECUTE format(
      'UPDATE accommodation_rates SET %I = %I WHERE COALESCE(%I, 0) = 0 AND COALESCE(%I, 0) > 0',
      pair.importer_col, pair.engine_col, pair.importer_col, pair.engine_col
    );
  END LOOP;
END $$;
