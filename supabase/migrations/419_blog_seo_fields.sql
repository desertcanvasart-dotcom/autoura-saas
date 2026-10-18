-- ============================================================================
-- 419 — blog posts: cover image alt text and a search description
-- ============================================================================
--
-- Every cover image on the blog rendered with alt="" — invisible to screen
-- readers and to image search — and a post's meta description could only be
-- its on-page summary. Two optional columns:
--   cover_image_alt  what the cover picture shows, for readers who cannot see
--                    it (the post title is used while it is empty)
--   seo_description  the snippet for search results and link previews, when
--                    it should differ from the summary (the summary, then the
--                    opening of the body, are used while it is empty)
-- Existing posts keep NULL. Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS cover_image_alt TEXT;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS seo_description TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_cover_image_alt_len') THEN
    ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_cover_image_alt_len
      CHECK (cover_image_alt IS NULL OR char_length(cover_image_alt) <= 250);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_seo_description_len') THEN
    ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_seo_description_len
      CHECK (seo_description IS NULL OR char_length(seo_description) <= 300);
  END IF;
END $$;

COMMIT;
