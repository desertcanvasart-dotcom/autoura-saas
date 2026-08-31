-- ============================================================================
-- 313 — supplier properties, Phase 3: trains (the last vertical)
-- ============================================================================
-- Same reasoning as the parent app: train_rates and sleeping_train_rates carry
-- only operator_name (the COMPANY) — no per-train name column — so the link is
-- an explicit, optional property_id. No backfill (nothing to resolve a name
-- from) and no rename write-through (nothing displays a train name).
--
-- Backend parity only in this app for now: the train rate FORMS here have no
-- supplier picker at all, so the UI picker lands whenever they gain one. The
-- API accepts and validates property_id today so the model is uniform.

BEGIN;

ALTER TABLE train_rates
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES supplier_properties(id) ON DELETE SET NULL;

ALTER TABLE sleeping_train_rates
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES supplier_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_train_rates_property
  ON train_rates (property_id);
CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_property
  ON sleeping_train_rates (property_id);

COMMIT;
