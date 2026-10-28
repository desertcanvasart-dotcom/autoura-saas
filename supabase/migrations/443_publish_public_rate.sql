-- ============================================================================
-- Publish: one public rate per tour (operator brief, 2026-10-28)
-- ============================================================================
-- A tour shows ONE public price: never a split by nationality, passport or
-- residence. The pricing engine proposes it (every traveller count in the
-- tour's group size, at the higher of the EU and other-nationality figures)
-- and a manager approves it; the approved bands are what every visitor sees
-- until a manager approves new ones. Nationality rates stay inside the engine.
--
-- public_rate: { tier, currency, bands: [{ minPax, maxPax, perPerson }] }
--   NULL = no public price yet (the page cannot be published).
-- Idempotent.

ALTER TABLE public.publish_pages ADD COLUMN IF NOT EXISTS public_rate JSONB;
ALTER TABLE public.publish_pages ADD COLUMN IF NOT EXISTS public_rate_approved_at TIMESTAMPTZ;
ALTER TABLE public.publish_pages ADD COLUMN IF NOT EXISTS public_rate_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.publish_pages ADD COLUMN IF NOT EXISTS public_rate_approver_name TEXT;

ALTER TABLE public.publish_pages DROP CONSTRAINT IF EXISTS publish_pages_public_rate_shape;
ALTER TABLE public.publish_pages ADD CONSTRAINT publish_pages_public_rate_shape CHECK (
  public_rate IS NULL OR (
    kind = 'tour'
    AND jsonb_typeof(public_rate -> 'bands') = 'array'
    AND jsonb_array_length(public_rate -> 'bands') > 0
    AND public_rate ? 'currency'
    AND public_rate ? 'tier'
    AND public_rate_approved_at IS NOT NULL
  )
);
