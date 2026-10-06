-- ============================================================================
-- 398 — Day blocks: the agency's standard days
-- ============================================================================
--
-- An itinerary day used to be invented each time: the AI decided its city,
-- where the night was, the meals and the guide, and the code trusted it. The
-- agency's own days — "Giza Pyramids & GEM", "Alexandria day trip from
-- Cairo", "Fly Cairo to Luxor" — existed only inside one tour each, with no
-- name or id of their own, so nothing could reuse them.
--
-- A day block is one standard day, kept once per agency:
--   · what it is      — code, name, the shorthand the team writes, day type;
--   · where           — the city it is spent in, and the city it ends in
--                       when it moves you (a transfer);
--   · its night       — same (the stay goes on; the block books no bed),
--                       move (the night is in to_city), included (the block
--                       itself includes the night, e.g. a desert camp),
--                       on_board, or none (a departure);
--   · what it books   — paid attractions, photo stops, guide, meals,
--                       transport, assistance, optional extras.
--
-- Tours, the Pricing Grid and the AI read days from here (later steps); this
-- migration only adds the library. Additive and replay-safe.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.day_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  shorthand text[] NOT NULL DEFAULT '{}',
  day_type text NOT NULL DEFAULT 'tour'
    CHECK (day_type IN ('arrival', 'tour', 'transfer', 'cruise', 'free', 'departure')),
  city text,
  to_city text,
  night text NOT NULL DEFAULT 'same'
    CHECK (night IN ('same', 'move', 'included', 'on_board', 'none')),
  night_place text,
  attractions text[] NOT NULL DEFAULT '{}',
  photo_stops text[] NOT NULL DEFAULT '{}',
  guide text NOT NULL DEFAULT 'none'
    CHECK (guide IN ('egyptologist', 'assistant', 'spot', 'none')),
  -- { "breakfast": { "included": bool, "venue": text|null }, "lunch": …, "dinner": … }
  meals jsonb NOT NULL DEFAULT '{}'::jsonb,
  transport text,
  assistance text[] NOT NULL DEFAULT '{}',
  optional_extras text[] NOT NULL DEFAULT '{}',
  description text,
  notes text,
  source text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_day_blocks_tenant_active ON public.day_blocks (tenant_id, is_active);

ALTER TABLE public.day_blocks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id_day_blocks ON public.day_blocks;
CREATE TRIGGER set_tenant_id_day_blocks
  BEFORE INSERT ON public.day_blocks
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- The four-policy pattern (docs/ARCHITECTURE.md).
DROP POLICY IF EXISTS day_blocks_select ON public.day_blocks;
CREATE POLICY day_blocks_select ON public.day_blocks
  FOR SELECT USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS day_blocks_insert ON public.day_blocks;
CREATE POLICY day_blocks_insert ON public.day_blocks
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS day_blocks_update ON public.day_blocks;
CREATE POLICY day_blocks_update ON public.day_blocks
  FOR UPDATE USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS day_blocks_delete ON public.day_blocks;
CREATE POLICY day_blocks_delete ON public.day_blocks
  FOR DELETE USING (tenant_id = get_user_tenant_id());

COMMIT;
