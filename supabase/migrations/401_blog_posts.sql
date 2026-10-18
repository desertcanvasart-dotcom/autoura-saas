-- ============================================================================
-- 401 — blog_posts: the public product blog
-- ============================================================================
--
-- Posts for tour operators — product news, how-tos, operations tips — shown
-- at /blog on the public site and written at /super-admin/blog by super
-- admins (SUPER_ADMIN_EMAILS). Ported from travel-ops-pro.
--
--   PLATFORM-WIDE, NOT PER TENANT. There is no tenant_id: the blog belongs
--   to the product, not to any agency using it.
--
--   SERVER-ONLY. No policy for anon or authenticated, and their table grants
--   are revoked: the public pages read published posts on the server with the
--   service role, and only the super-admin API writes. A visitor's browser
--   never queries this table, so a draft cannot leak through the REST API —
--   and scripts/verify-rls.mjs finds nothing anon can read.
--
--   body_html is sanitised on save (lib/blog/sanitize.ts) and again on render.
--
--   A published post has a publish date; a slug is lowercase-and-hyphens and
--   unique, because it is the URL (/blog/<slug>).
--
-- Additive and replay-safe.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ja')),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  excerpt TEXT CHECK (excerpt IS NULL OR char_length(excerpt) <= 500),
  body_html TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  author_name TEXT CHECK (author_name IS NULL OR char_length(author_name) <= 120),
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blog_posts_published_has_date CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON public.blog_posts (published_at DESC) WHERE status = 'published';

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.blog_posts FROM anon, authenticated;

DROP POLICY IF EXISTS blog_posts_service_role ON public.blog_posts;
CREATE POLICY blog_posts_service_role ON public.blog_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Self-verifying probe: nothing but the service role has a policy, a post
-- round-trips, and a bad slug or an undated published post is refused.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  probe UUID := gen_random_uuid();
  got TEXT;
  bad_slug BOOLEAN := false;
  undated BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blog_posts'
               AND NOT (roles = ARRAY['service_role']::name[])) THEN
    RAISE EXCEPTION 'blog_posts must have no policy for anyone but service_role';
  END IF;

  INSERT INTO public.blog_posts (id, slug, title, status, published_at)
  VALUES (probe, 'zz-migration-probe', 'Probe', 'published', NOW());
  SELECT slug INTO got FROM public.blog_posts WHERE id = probe;
  DELETE FROM public.blog_posts WHERE id = probe;
  IF got IS DISTINCT FROM 'zz-migration-probe' THEN
    RAISE EXCEPTION 'probe post did not round-trip (got %)', got;
  END IF;

  BEGIN
    INSERT INTO public.blog_posts (slug, title) VALUES ('Not A Slug!', 'Probe');
  EXCEPTION WHEN check_violation THEN bad_slug := true;
  END;
  BEGIN
    INSERT INTO public.blog_posts (slug, title, status) VALUES ('zz-undated', 'Probe', 'published');
  EXCEPTION WHEN check_violation THEN undated := true;
  END;
  IF NOT bad_slug THEN RAISE EXCEPTION 'a bad slug was accepted'; END IF;
  IF NOT undated THEN RAISE EXCEPTION 'a published post without a date was accepted'; END IF;
  RAISE NOTICE 'probe: round-trip ok, bad slug and undated publish rejected';
END $$;

COMMIT;
