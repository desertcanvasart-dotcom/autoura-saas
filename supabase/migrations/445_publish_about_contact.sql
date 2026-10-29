-- ============================================
-- 445: the website template's Contact form answers, and website photos
-- ============================================
-- Boards 11/12 (operator, 2026-10-29). The Contact page asks more than the
-- tour form: a WhatsApp number, the country the visitor travels from, arrival
-- date (publish_enquiries.dates already holds it), nights, adults, children,
-- what interests them, and their consent to be contacted. Each answer is kept
-- as its own column so it can be searched and used later; the country is
-- never used for pricing (one public price per tour, brief 2026-10-28).
--
-- Website photos (the About page's team photo and people's portraits) live in
-- a public bucket of their own. Only the app's server writes to it (the
-- upload route checks the manager role and the file), so there are no
-- insert/update policies for signed-in users; reading is public because the
-- photos are on the public website.

BEGIN;

ALTER TABLE public.publish_enquiries
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS nights INTEGER,
  ADD COLUMN IF NOT EXISTS adults INTEGER,
  ADD COLUMN IF NOT EXISTS children INTEGER,
  ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

ALTER TABLE public.publish_enquiries
  DROP CONSTRAINT IF EXISTS publish_enquiries_counts_check;
ALTER TABLE public.publish_enquiries
  ADD CONSTRAINT publish_enquiries_counts_check CHECK (
    (nights IS NULL OR nights BETWEEN 1 AND 90)
    AND (adults IS NULL OR adults BETWEEN 1 AND 99)
    AND (children IS NULL OR children BETWEEN 0 AND 99)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('publish-media', 'publish-media', true)
    ON CONFLICT (id) DO UPDATE SET public = true;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types'
    ) THEN
      UPDATE storage.buckets
         SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']::text[],
             file_size_limit = 5242880
       WHERE id = 'publish-media';
    END IF;
  END IF;
END $$;

COMMIT;
